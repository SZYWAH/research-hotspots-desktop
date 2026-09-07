param([Parameter(Mandatory = $true)][int]$TargetProcessId)
$ErrorActionPreference = 'Stop'
# Read-only Windows WCT diagnostics. Never reads process memory, lock names,
# browser storage or credentials; output is limited to numeric wait topology.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SideraWaitChain {
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern IntPtr OpenThreadWaitChainSession(uint flags, IntPtr callback);
  [DllImport("advapi32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetThreadWaitChain(IntPtr session, UIntPtr context, uint flags,
    uint threadId, ref uint count, IntPtr nodes, [MarshalAs(UnmanagedType.Bool)] out bool cycle);
  [DllImport("advapi32.dll")]
  public static extern void CloseThreadWaitChainSession(IntPtr session);
}
'@
$taskProcess = Get-Process -Id $TargetProcessId
if ($taskProcess.ProcessName -ne 'research-hotspots-desktop') {
  throw 'Only the Sidera desktop process may be inspected.'
}
$taskSession = [SideraWaitChain]::OpenThreadWaitChainSession(0, [IntPtr]::Zero)
if ($taskSession -eq [IntPtr]::Zero) { throw 'Cannot open WCT session.' }
# WAITCHAIN_NODE_INFO from Windows SDK wct.h: two enums + 272-byte union.
$taskBuffer = [Runtime.InteropServices.Marshal]::AllocHGlobal(280 * 16)
try {
  $taskResults = foreach ($taskThread in $taskProcess.Threads) {
    [uint32]$taskCount = 16
    [bool]$taskCycle = $false
    $taskOk = [SideraWaitChain]::GetThreadWaitChain($taskSession, [UIntPtr]::Zero,
      0, $taskThread.Id, [ref]$taskCount, $taskBuffer, [ref]$taskCycle)
    if (-not $taskOk) {
      [pscustomobject]@{threadId=$taskThread.Id; error=[Runtime.InteropServices.Marshal]::GetLastWin32Error()}
      continue
    }
    $taskNodes = for ($taskIndex = 0; $taskIndex -lt $taskCount; $taskIndex++) {
      $taskNode = [IntPtr]::Add($taskBuffer, 280 * $taskIndex)
      $taskType = [Runtime.InteropServices.Marshal]::ReadInt32($taskNode)
      $taskEntry = [ordered]@{type=$taskType; status=[Runtime.InteropServices.Marshal]::ReadInt32($taskNode, 4)}
      if ($taskType -eq 8) {
        $taskEntry.processId = [Runtime.InteropServices.Marshal]::ReadInt32($taskNode, 8)
        $taskEntry.threadId = [Runtime.InteropServices.Marshal]::ReadInt32($taskNode, 12)
      }
      [pscustomobject]$taskEntry
    }
    [pscustomobject]@{threadId=$taskThread.Id; cycle=$taskCycle; nodes=@($taskNodes)}
  }
  [pscustomobject]@{processId=$TargetProcessId; observedAt=[DateTimeOffset]::Now; waits=@($taskResults)} | ConvertTo-Json -Depth 6
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($taskBuffer)
  [SideraWaitChain]::CloseThreadWaitChainSession($taskSession)
}
