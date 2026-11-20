# Builds every application icon from the Planner Board Cover image.
#
#   assets/icon/icon.ico        multi-size Windows icon (window, taskbar, exe, installer)
#   assets/icon/png/icon-N.png  individual sizes for Electron/tray/docs
#   assets/icon/icon-512.png    store / docs size
#   public/favicon.ico          browser-style favicon used by index.html
#   public/favicon-32.png       PNG favicon fallback
#
# The cover is already a finished square logo, so it is only resampled
# (high-quality bicubic) - nothing is cropped or redrawn.
param(
  [string]$Source = "C:\Users\pc\Desktop\L3\Planner Board Cover.jpg"
)
Add-Type -AssemblyName System.Drawing

$dir = Split-Path $PSCommandPath
$root = Split-Path (Split-Path $dir)
if (-not (Test-Path $Source)) { throw "Source image not found: $Source" }
$Sizes = 16, 24, 32, 48, 64, 128, 256, 512

if (-not ("IconMaker" -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class IconMaker
{
    // High-quality square resample (source is square, so nothing is distorted).
    public static void Resize(string src, string dst, int size)
    {
        using (var img = Image.FromFile(src))
        using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bmp))
            {
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);
                g.DrawImage(img, new Rectangle(0, 0, size, size));
            }
            bmp.Save(dst, ImageFormat.Png);
        }
    }

    // Writes a standard .ico containing PNG-compressed frames (Vista+ format).
    public static void WriteIco(string[] pngs, int[] sizes, string icoPath)
    {
        var frames = new byte[pngs.Length][];
        for (int i = 0; i < pngs.Length; i++) frames[i] = File.ReadAllBytes(pngs[i]);

        using (var fs = new FileStream(icoPath, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);            // reserved
            bw.Write((ushort)1);            // type: icon
            bw.Write((ushort)pngs.Length);  // image count
            int offset = 6 + 16 * pngs.Length;
            for (int i = 0; i < pngs.Length; i++)
            {
                int s = sizes[i];
                bw.Write((byte)(s >= 256 ? 0 : s)); // width  (0 means 256)
                bw.Write((byte)(s >= 256 ? 0 : s)); // height (0 means 256)
                bw.Write((byte)0);   // palette colors
                bw.Write((byte)0);   // reserved
                bw.Write((ushort)1); // color planes
                bw.Write((ushort)32); // bits per pixel
                bw.Write((uint)frames[i].Length);
                bw.Write((uint)offset);
                offset += frames[i].Length;
            }
            foreach (var f in frames) bw.Write(f);
        }
    }
}
"@
}

New-Item -ItemType Directory -Force -Path "$dir\png" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\public" | Out-Null

foreach ($s in $Sizes) { [IconMaker]::Resize($Source, "$dir\png\icon-$s.png", $s) }
Copy-Item "$dir\png\icon-512.png" "$dir\icon-512.png" -Force
Copy-Item "$dir\png\icon-32.png"  "$root\public\favicon-32.png" -Force

$icoSizes = 16, 24, 32, 48, 64, 128, 256
$pngs = @($icoSizes | ForEach-Object { "$dir\png\icon-$_.png" })
[IconMaker]::WriteIco($pngs, $icoSizes, "$dir\icon.ico")

# Browser-style favicon (same artwork, smaller frame set)
$favSizes = 16, 32, 48
$favPngs = @($favSizes | ForEach-Object { "$dir\png\icon-$_.png" })
[IconMaker]::WriteIco($favPngs, $favSizes, "$root\public\favicon.ico")

Write-Output "icons written from: $Source"
Get-ChildItem "$dir\icon.ico", "$dir\icon-512.png", "$root\public\favicon.ico", "$root\public\favicon-32.png" |
  Select-Object Name, Length | Format-Table -AutoSize
