import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

from config import CHROME_DRIVER_PATH

def create_driver(headless: bool = True):
    chrome_options = Options()

    # ===============================
    # 1. 基础运行配置（Docker 必备）
    # ===============================
    if headless:
        chrome_options.add_argument("--headless=new")

    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")

    # ===============================
    # 2. 反爬配置（统一放这里）
    # ===============================
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")

    chrome_options.page_load_strategy = "eager"

    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    # ===============================
    # 3. 浏览器路径适配（关键）
    # ===============================
    possible_binaries = [
        os.getenv("CHROME_BINARY"),
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
    ]

    binary_found = False
    for binary in possible_binaries:
        if binary and os.path.exists(binary):
            chrome_options.binary_location = binary
            binary_found = True
            break

    if not binary_found:
        print("⚠️ 未找到 Chrome/Chromium 二进制，可能在本地环境运行")

    # ===============================
    # 4. 启动 driver
    # ===============================
    service = Service(CHROME_DRIVER_PATH)
    driver = webdriver.Chrome(service=service, options=chrome_options)

    # ===============================
    # 5. 彻底隐藏 webdriver 标识（关键反爬）
    # ===============================
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": """
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            """
        }
    )

    return driver