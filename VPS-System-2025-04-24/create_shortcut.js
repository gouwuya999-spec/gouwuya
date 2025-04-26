// Create Shell Object
var shell = WScript.CreateObject("WScript.Shell");
var fso = WScript.CreateObject("Scripting.FileSystemObject");

// Get paths
var desktop = shell.SpecialFolders("Desktop");
var currentPath = fso.GetParentFolderName(WScript.ScriptFullName);

try {
    // Create shortcut
    var shortcut = shell.CreateShortcut(desktop + "\\VPS管理系统.lnk");
    shortcut.TargetPath = currentPath + "\\无窗口启动.vbs";
    shortcut.WorkingDirectory = currentPath;
    shortcut.IconLocation = currentPath + "\\icon.ico";
    shortcut.Description = "VPS管理系统";
    shortcut.Save();
    
    // Show success message
    WScript.Echo("Shortcut created successfully!");
    WScript.Echo("Location: " + desktop + "\\VPS管理系统.lnk");
} catch(e) {
    // Show error
    WScript.Echo("Error: " + e.message);
} 