import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path


BLOCK_MARKERS = [
    "验证码",
    "安全验证",
    "访问过于频繁",
    "异常访问",
    "系统检测到",
    "人机验证",
    "请完成验证",
    "请输入验证码",
    "请先登录",
    "登录后查看",
    "需要登录",
]


def parse_bool(value, default):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def parse_int(value, default, minimum):
    try:
        return max(minimum, int(value))
    except (TypeError, ValueError):
        return default


def default_chrome_user_data_dir():
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return ""
    candidate = Path(local_app_data) / "Google" / "Chrome" / "User Data"
    return str(candidate) if candidate.exists() else ""


def read_config(input_data):
    settings = input_data.get("settings") or {}

    def pick(key, env_names, default=""):
        value = settings.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
        for name in env_names:
            env_value = os.environ.get(name)
            if env_value and env_value.strip():
                return env_value.strip()
        return default

    headless_value = settings.get("headless")
    if headless_value is None:
        headless_value = os.environ.get("CNKI_HEADLESS")

    return {
        "chrome_driver_path": pick("chromeDriverPath", ["CNKI_CHROME_DRIVER_PATH", "CHROMEDRIVER_PATH", "CHROME_DRIVER_PATH"]),
        "chrome_user_data_dir": pick("chromeUserDataDir", ["CNKI_CHROME_USER_DATA_DIR", "CHROME_USER_DATA_DIR"], default_chrome_user_data_dir()),
        "chrome_profile": pick("chromeProfile", ["CNKI_CHROME_PROFILE", "CHROME_PROFILE"], "Default"),
        "headless": parse_bool(headless_value, True),
        "wait_timeout_sec": parse_int(settings.get("waitTimeoutSec") or os.environ.get("CNKI_WAIT_TIMEOUT"), 20, 3),
        "page_load_timeout_sec": parse_int(settings.get("pageLoadTimeoutSec") or os.environ.get("CNKI_PAGE_LOAD_TIMEOUT") or os.environ.get("CNKI_PAGELOAD_TIMEOUT"), 45, 5),
        "implicit_wait_sec": parse_int(settings.get("implicitWaitSec") or os.environ.get("CNKI_IMPLICIT_WAIT"), 2, 0),
        "debug_dir": pick("debugDir", ["CNKI_DEBUG_DIR"], str(Path(os.environ.get("TEMP", ".")) / "research-hotspots-cnki")),
    }


def result(ok, message, papers=None, debug_artifacts=None, started=None):
    elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
    return {
        "ok": ok,
        "message": message,
        "papers": papers or [],
        "debugArtifacts": debug_artifacts or [],
        "elapsedMs": elapsed_ms,
    }


def compact_error_message(message, config):
    lower = message.lower()
    first_line = message.splitlines()[0].strip() if message else "unknown error"

    if "devtoolsactiveport" in lower:
        mode_hint = (
            "cannot be used in headless mode, the profile is locked, or Chrome crashed before "
            "DevTools started"
            if config.get("headless")
            else "is locked, incompatible with automation startup, or Chrome crashed before DevTools started"
        )
        return (
            "Chrome failed to start in Selenium. This usually means the selected Chrome profile "
            f"{mode_hint}. Try closing Chrome, disabling headless for the default profile, or using a dedicated "
            f"Chrome user data directory. Original: {first_line}"
        )
    if "timed out receiving message from renderer" in lower:
        return (
            "Chrome started, but the page renderer timed out while loading CNKI. This can happen "
            "when the profile is not logged in, the network is slow, CNKI requires manual handling, "
            f"or the page is blocked. Debug snapshots may help. Original: {first_line}"
        )
    if "user data directory is already in use" in lower:
        return (
            "Chrome profile is already in use. Close Chrome, choose a dedicated Chrome user data "
            f"directory, or disable default-profile reuse. Original: {first_line}"
        )
    if "session not created" in lower and "profile" in lower:
        return (
            "Chrome session was not created, likely because the profile is unavailable or incompatible "
            f"with the selected mode. Original: {first_line}"
        )

    return first_line if len(first_line) < 500 else f"{first_line[:500]}..."


def save_debug_snapshot(driver, debug_dir, prefix):
    artifacts = []
    try:
        path = Path(debug_dir)
        path.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_path = path / f"{prefix}_{stamp}.html"
        html_path.write_text(driver.page_source, encoding="utf-8")
        artifacts.append(str(html_path))

        png_path = path / f"{prefix}_{stamp}.png"
        try:
            if driver.save_screenshot(str(png_path)):
                artifacts.append(str(png_path))
        except Exception:
            pass
    except Exception as error:
        artifacts.append(f"debug snapshot failed: {error}")
    return artifacts


def page_text(driver):
    try:
        bodies = driver.find_elements("tag name", "body")
        return bodies[0].text if bodies else ""
    except Exception:
        return ""


def detect_block(driver):
    text = page_text(driver)
    for marker in BLOCK_MARKERS:
        if marker in text:
            return marker
    return ""


def first_text(row, selectors):
    for selector in selectors:
        try:
            found = row.find_elements("css selector", selector)
            for item in found:
                text = item.text.strip()
                if text:
                    return text
        except Exception:
            continue
    return ""


def first_title_element(row):
    for selector in ["td.name a", "a.fz14", ".name a", "a"]:
        try:
            found = row.find_elements("css selector", selector)
            for item in found:
                text = item.text.strip()
                if text:
                    return item
        except Exception:
            continue
    return None


def parse_year(value):
    match = re.search(r"(19|20)\d{2}", value or "")
    return int(match.group(0)) if match else None


def infer_field(query):
    value = (query or "").lower()
    if re.search(r"protein|biology|gene|cell|蛋白|生物|基因|细胞", value):
        return "Computational Biology"
    if re.search(r"quantum|量子", value):
        return "Quantum Physics"
    if re.search(r"geometry|moduli|algebraic|几何|模空间|代数", value):
        return "Algebraic Geometry"
    if re.search(r"medical|imaging|diagnosis|医学|影像|诊断", value):
        return "Medical Imaging"
    return "Artificial Intelligence"


def parse_row(row, query):
    title_el = first_title_element(row)
    if not title_el:
        return None

    title = re.sub(r"\s+", " ", title_el.text).strip()
    if len(title) < 2:
        return None

    link = title_el.get_attribute("href") or ""
    authors = first_text(row, ["td.author", ".author", "[class*='author']"])
    source = first_text(row, ["td.source", ".source", "[class*='source']"])
    date_text = first_text(row, ["td.date", ".date", "[class*='date']", "td.time", ".time"])
    if not date_text:
        date_text = first_text(row, ["td:nth-child(5)", "td:nth-child(6)"])
    year = parse_year(date_text)
    digest = hashlib.sha1(f"{title}|{link}|{date_text}".encode("utf-8")).hexdigest()[:18]
    trace_parts = []
    if authors:
        trace_parts.append(f"作者：{authors}")
    if source:
        trace_parts.append(f"来源：{source}")
    if date_text:
        trace_parts.append(f"日期：{date_text}")
    abstract = "；".join(trace_parts) or "CNKI 页面未提供摘要，已记录题名和来源链接。"

    return {
        "id": f"cnki:{digest}",
        "source": "cnki",
        "title": title[:500],
        "abstract": abstract[:3000],
        "authors": authors,
        "categories": source,
        "field": infer_field(query),
        "publishedDate": date_text,
        "year": year,
        "url": link,
        "doi": "",
    }


def create_driver(config):
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
    except Exception as error:
        raise RuntimeError(f"缺少 Selenium 依赖：{error}。请先安装 requirements-base.txt 中的 selenium。") from error

    driver_path = config["chrome_driver_path"]
    if not driver_path or not Path(driver_path).exists():
        raise RuntimeError("ChromeDriver 路径无效。请在设置页填写 CNKI_CHROME_DRIVER_PATH 对应的 chromedriver.exe。")

    options = Options()
    if config["headless"]:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1366,900")
    options.add_argument("--lang=zh-CN")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-extensions")
    options.add_argument("--remote-debugging-port=0")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    if sys.platform != "win32":
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")

    if config["chrome_user_data_dir"]:
        options.add_argument(f"--user-data-dir={config['chrome_user_data_dir']}")
    if config["chrome_profile"]:
        options.add_argument(f"--profile-directory={config['chrome_profile']}")

    service = Service(driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(config["page_load_timeout_sec"])
    driver.implicitly_wait(config["implicit_wait_sec"])
    return driver


def find_search_box(driver, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec

    locators = [
        (By.ID, "txt_SearchText"),
        (By.NAME, "txt_SearchText"),
        (By.CSS_SELECTOR, "input.search-input"),
        (By.CSS_SELECTOR, "input[type='text']"),
    ]
    last_error = None
    for locator in locators:
        try:
            return wait.until(ec.presence_of_element_located(locator))
        except Exception as error:
            last_error = error
    raise RuntimeError(f"未找到 CNKI 搜索框：{last_error}")


def wait_for_results(driver, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec

    wait.until(ec.presence_of_element_located((By.CSS_SELECTOR, ".result-table-list, .grid-table, .empty-list, table, body")))
    if len(driver.window_handles) > 1:
        driver.switch_to.window(driver.window_handles[-1])


def collect_rows(driver):
    selectors = [
        "//tr[td[contains(@class,'name')]]",
        "//table//tr[td//a[contains(@href,'kns') or contains(@href,'kcms')]]",
        "//div[contains(@class,'result')]//a[contains(@href,'kns') or contains(@href,'kcms')]/ancestor::*[self::tr or self::div][1]",
    ]
    for selector in selectors:
        try:
            rows = driver.find_elements("xpath", selector)
            if rows:
                return rows
        except Exception:
            continue
    return []


def click_next_page(driver):
    from selenium.webdriver.common.by import By

    locators = [
        (By.ID, "PageNext"),
        (By.LINK_TEXT, "下一页"),
        (By.PARTIAL_LINK_TEXT, "下一页"),
    ]
    for locator in locators:
        try:
            next_page = driver.find_element(*locator)
            class_name = (next_page.get_attribute("class") or "").lower()
            disabled = (next_page.get_attribute("aria-disabled") or "").lower() == "true"
            if "disable" in class_name or disabled:
                return False
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_page)
            driver.execute_script("arguments[0].click();", next_page)
            return True
        except Exception:
            continue
    return False


def run_search(input_data):
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait

    started = time.perf_counter()
    config = read_config(input_data)
    query = str(input_data.get("query") or "").strip()
    max_results = parse_int(input_data.get("maxResults"), 20, 1)
    max_results = min(max_results, 100)
    driver = None
    artifacts = []

    if not query:
        return result(False, "CNKI 检索关键词为空。", started=started)

    try:
        driver = create_driver(config)
        wait = WebDriverWait(driver, config["wait_timeout_sec"])
        driver.get("https://www.cnki.net/")

        marker = detect_block(driver)
        if marker:
            artifacts.extend(save_debug_snapshot(driver, config["debug_dir"], "cnki_blocked_home"))
            return result(False, f"CNKI 访问受限或需要人工处理：{marker}", debug_artifacts=artifacts, started=started)

        search_box = find_search_box(driver, wait)
        search_box.clear()
        search_box.send_keys(query)
        search_box.send_keys(Keys.ENTER)
        time.sleep(2)
        wait_for_results(driver, wait)

        marker = detect_block(driver)
        if marker:
            artifacts.extend(save_debug_snapshot(driver, config["debug_dir"], "cnki_blocked_result"))
            return result(False, f"CNKI 结果页受限或需要人工处理：{marker}", debug_artifacts=artifacts, started=started)

        papers = []
        seen = set()
        while len(papers) < max_results:
            rows = collect_rows(driver)
            if not rows:
                body = page_text(driver)
                if "暂无数据" in body or "未找到" in body:
                    return result(True, "CNKI 未检索到结果。", papers=papers, started=started)
                artifacts.extend(save_debug_snapshot(driver, config["debug_dir"], "cnki_no_rows"))
                return result(False, "CNKI 页面结构可能变化，未解析到结果行。", papers=papers, debug_artifacts=artifacts, started=started)

            before_count = len(papers)
            for row in rows:
                if len(papers) >= max_results:
                    break
                paper = parse_row(row, query)
                if not paper:
                    continue
                title_key = paper["title"].lower().strip()
                if title_key in seen:
                    continue
                seen.add(title_key)
                papers.append(paper)

            if len(papers) == before_count or len(papers) >= max_results:
                break
            if not click_next_page(driver):
                break
            time.sleep(2)
            wait_for_results(driver, wait)

        return result(True, f"CNKI 检索完成：{len(papers)} 篇。", papers=papers, debug_artifacts=artifacts, started=started)
    except Exception as error:
        message = compact_error_message(str(error), config)
        if driver:
            artifacts.extend(save_debug_snapshot(driver, config["debug_dir"], "cnki_exception"))
        return result(False, message, debug_artifacts=artifacts, started=started)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def main():
    if len(sys.argv) < 2:
        print(json.dumps(result(False, "missing input json path"), ensure_ascii=False))
        return
    input_path = Path(sys.argv[1])
    input_data = json.loads(input_path.read_text(encoding="utf-8-sig"))
    print(json.dumps(run_search(input_data), ensure_ascii=False))


if __name__ == "__main__":
    main()
