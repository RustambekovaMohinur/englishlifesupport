$env:Path = "C:\Program Files\nodejs;C:\WINDOWS\system32;C:\WINDOWS;C:\WINDOWS\System32\Wbem;" + $env:Path
Set-Location "C:\Users\User\.gemini\antigravity\scratch\english-life-lms\frontend"
& "C:\Program Files\nodejs\npm.cmd" run build
