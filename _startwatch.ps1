# Instant, event-driven watch for the Start menu opening.
# Fires the moment StartMenuExperienceHost becomes the foreground window
# (which happens whether you click Start OR press the Windows key), then prints
# SHOW so the app reveals the panel with no polling delay.
$code = @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
public class SW {
  public delegate void WinEventDelegate(IntPtr hHook, uint ev, IntPtr hwnd, int idObj, int idChild, uint thread, uint time);
  [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint eMin, uint eMax, IntPtr hmod, WinEventDelegate cb, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG m, IntPtr hWnd, uint a, uint b);
  [DllImport("user32.dll")] public static extern bool TranslateMessage([In] ref MSG m);
  [DllImport("user32.dll")] public static extern IntPtr DispatchMessage([In] ref MSG m);
  public static WinEventDelegate _cb;
  static void OnEvent(IntPtr h, uint ev, IntPtr hwnd, int o, int c, uint th, uint tm) {
    try {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      Process p = Process.GetProcessById((int)pid);
      if (p != null && string.Equals(p.ProcessName, "StartMenuExperienceHost", StringComparison.OrdinalIgnoreCase)) {
        Console.Out.WriteLine("SHOW"); Console.Out.Flush();
      }
    } catch {}
  }
  public static void Run() {
    _cb = new WinEventDelegate(OnEvent);
    SetWinEventHook(0x0003, 0x0003, IntPtr.Zero, _cb, 0, 0, 0x0000); // EVENT_SYSTEM_FOREGROUND, OUTOFCONTEXT
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) != 0) { TranslateMessage(ref m); DispatchMessage(ref m); }
  }
}
'@
try {
  Add-Type -TypeDefinition $code -ErrorAction Stop
  [SW]::Run()
} catch {
  # Fallback: fast polling if the event hook can't be created.
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
  $last = ''
  while ($true) {
    try {
      $h = [FG]::GetForegroundWindow(); $procId = 0
      [void][FG]::GetWindowThreadProcessId($h, [ref]$procId)
      $name = ''
      try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
      if ($name -match 'StartMenuExperienceHost') { if ($last -ne 'start') { Write-Output 'SHOW'; [Console]::Out.Flush(); $last = 'start' } }
      else { $last = '' }
    } catch {}
    Start-Sleep -Milliseconds 50
  }
}
