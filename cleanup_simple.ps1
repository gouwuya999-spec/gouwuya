# Cleanup VPS Management System shortcuts
Write-Host "Checking VPS Management System shortcuts..."

$Desktop = "$env:USERPROFILE\Desktop"
$ShortcutsToCheck = @(
    "VPS Management System (Silent).lnk",
    "VPS Silent Mode.lnk", 
    "VPS管理系统(无窗口).lnk",
    "VPS管理系统.lnk",
    "VPS管理系统(带窗口).lnk"
)

Write-Host "`nFound shortcuts:"
$FoundShortcuts = @()

foreach ($shortcut in $ShortcutsToCheck) {
    $path = Join-Path $Desktop $shortcut
    if (Test-Path $path) {
        Write-Host "Found: $shortcut"
        $FoundShortcuts += $shortcut
    }
}

if ($FoundShortcuts.Count -gt 1) {
    Write-Host "`nMultiple shortcuts found. Keeping: VPS Management System (Silent).lnk"
    foreach ($shortcut in $FoundShortcuts) {
        if ($shortcut -ne "VPS Management System (Silent).lnk") {
            $path = Join-Path $Desktop $shortcut
            try {
                Remove-Item $path -Force
                Write-Host "Removed: $shortcut"
            } catch {
                Write-Host "Failed to remove: $shortcut"
            }
        }
    }
} else {
    Write-Host "`nOnly one shortcut found, no cleanup needed"
}

Write-Host "`nCleanup completed!"
