# Generates assets/icon.ico — the ColdADE app icon.
#
# Drawn with GDI+ rather than shipped as a binary blob so the mark can be
# tweaked and rebuilt: run `powershell -File assets\make-icon.ps1`.
#
# The mark: an ice crystal — a pointy-top hexagon with a frost rim and faceted
# face — carrying a terminal chevron and a cursor bar. The hexagon silhouette is
# the point: a blue rounded square with a chevron in it is PowerShell's icon, and
# ColdADE has to be told apart from a shell at 16px in the taskbar.
#
# Every measurement below is a fraction of the icon size, so the same geometry is
# re-rendered natively at each size instead of one bitmap being squashed down.
# Each size is supersampled 4x and reduced, which keeps the 16px entry (where
# the strokes land on ~1.5 pixels) from turning to mush.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$outPath = Join-Path $PSScriptRoot 'icon.ico'
$sizes   = @(16, 20, 24, 32, 40, 48, 64, 128, 256)

function New-RoundedPath {
    param([single]$x, [single]$y, [single]$w, [single]$h, [single]$r)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x,           $y,           $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y,           $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d,   0, 90)
    $p.AddArc($x,           $y + $h - $d, $d, $d,  90, 90)
    $p.CloseFigure()
    return $p
}

function Get-HexPoints {
    param([single]$cx, [single]$cy, [single]$r)
    # Pointy-top hexagon: a vertex straight up, so the silhouette is a gem
    # rather than a squircle.
    $pts = @()
    foreach ($k in 0..5) {
        $a = [Math]::PI / 180.0 * (-90 + $k * 60)
        $pts += , (New-Object System.Drawing.PointF(
            [single]($cx + $r * [Math]::Cos($a)),
            [single]($cy + $r * [Math]::Sin($a))))
    }
    return $pts
}

function New-HexPath {
    param([single]$cx, [single]$cy, [single]$r)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddPolygon((Get-HexPoints -cx $cx -cy $cy -r $r))
    return $p
}

function Render-Coldade {
    param([int]$size)

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s  = [single]$size
    $cx = $s * 0.5
    $cy = $s * 0.5
    $R  = $s * 0.485

    $crystal = New-HexPath $cx $cy $R
    $pts     = Get-HexPoints -cx $cx -cy $cy -r $R
    $full    = New-Object System.Drawing.RectangleF(0, 0, $s, $s)
    $oldClip = $g.Clip

    # ── Outer glow: the crystal sits in its own halo, so the shape still
    #    separates from a dark taskbar. ────────────────────────────────────
    $halo = New-HexPath $cx $cy ($R * 0.995)
    $haloPen = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(70, 56, 189, 248), [single]([Math]::Max(1.0, $s * 0.055)))
    $haloPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($haloPen, $halo)
    $haloPen.Dispose()
    $halo.Dispose()

    # ── Crystal face ──────────────────────────────────────────────────────
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $full,
        [System.Drawing.Color]::FromArgb(255, 25, 44, 70),
        [System.Drawing.Color]::FromArgb(255,  5,  9, 17),
        [single]115)
    $g.FillPath($bg, $crystal)
    $bg.Dispose()

    $g.SetClip($crystal)

    # Cold light from the top-left facet.
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(-$s * 0.30, -$s * 0.36, $s * 1.0, $s * 1.0)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glow.CenterColor    = [System.Drawing.Color]::FromArgb(110, 125, 225, 255)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 125, 225, 255))
    $g.FillPath($glow, $glowPath)
    $glow.Dispose()
    $glowPath.Dispose()

    # Facet: the top-left third of the gem catches more light than the rest.
    $facet = New-Object System.Drawing.Drawing2D.GraphicsPath
    $facet.AddPolygon(@($pts[0], $pts[5], $pts[4], (New-Object System.Drawing.PointF($cx, $cy))))
    $facetBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 190, 240, 255))
    $g.FillPath($facetBrush, $facet)
    $facetBrush.Dispose()
    $facet.Dispose()

    $g.Clip = $oldClip

    # ── Frost rim ─────────────────────────────────────────────────────────
    $rim = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $full,
        [System.Drawing.Color]::FromArgb(255, 190, 247, 255),
        [System.Drawing.Color]::FromArgb(235,  56, 130, 246),
        [single]125)
    $rimPen = New-Object System.Drawing.Pen($rim, [single]([Math]::Max(1.0, $s * 0.042)))
    $rimPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    $rimPen.LineJoin  = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($rimPen, $crystal)
    $rimPen.Dispose()
    $rim.Dispose()

    # ── Chevron + cursor bar ──────────────────────────────────────────────
    $ice = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $full,
        [System.Drawing.Color]::FromArgb(255, 205, 250, 255),
        [System.Drawing.Color]::FromArgb(255,  34, 211, 238),
        [single]140)
    $pen = New-Object System.Drawing.Pen($ice, [single]($s * 0.095))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $chev = New-Object System.Drawing.Drawing2D.GraphicsPath
    $chev.AddLines(@(
        (New-Object System.Drawing.PointF([single]($s * 0.330), [single]($s * 0.360))),
        (New-Object System.Drawing.PointF([single]($s * 0.505), [single]($s * 0.505))),
        (New-Object System.Drawing.PointF([single]($s * 0.330), [single]($s * 0.650)))
    ))
    $g.DrawPath($pen, $chev)
    $chev.Dispose()
    $pen.Dispose()
    $ice.Dispose()

    $barH = $s * 0.093
    $bar  = New-RoundedPath ($s * 0.560) ($s * 0.557) ($s * 0.150) $barH ($barH / 2)
    $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 253, 255))
    $g.FillPath($barBrush, $bar)
    $barBrush.Dispose()
    $bar.Dispose()

    $crystal.Dispose()
    $g.Dispose()
    return $bmp
}

function Render-Scaled {
    param([int]$size)
    # Supersample: draw big, reduce. GDI+ hinting on thin strokes is poor at
    # 16-32px, so the reduction does the antialiasing instead.
    $factor = 4
    $big = Render-Coldade -size ($size * $factor)
    $out = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($big, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
    $g.Dispose()
    $big.Dispose()
    return $out
}

function ConvertTo-Dib {
    param([System.Drawing.Bitmap]$bmp)
    # A classic BITMAPINFOHEADER + bottom-up BGRA payload + (empty) AND mask.
    # PNG-compressed entries are legal from Vista on, but plenty of consumers
    # still decode small entries as raw DIB — .NET's own System.Drawing.Icon
    # among them — and render PNG bytes as confetti. So only the two largest
    # sizes go out as PNG; everything the shell actually draws in a taskbar or
    # a Start tile is a DIB.
    $w = $bmp.Width
    $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $raw = New-Object 'Byte[]' ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
    $bmp.UnlockBits($data)

    $maskStride = [Math]::Ceiling($w / 8.0)
    if ($maskStride % 4 -ne 0) { $maskStride += 4 - ($maskStride % 4) }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([UInt32]40)            # biSize
    $bw.Write([Int32]$w)             # biWidth
    $bw.Write([Int32]($h * 2))       # biHeight: colour rows + mask rows
    $bw.Write([UInt16]1)             # biPlanes
    $bw.Write([UInt16]32)            # biBitCount
    $bw.Write([UInt32]0)             # biCompression: BI_RGB
    $bw.Write([UInt32]($w * $h * 4)) # biSizeImage
    $bw.Write([Int32]0); $bw.Write([Int32]0)
    $bw.Write([UInt32]0); $bw.Write([UInt32]0)

    for ($y = $h - 1; $y -ge 0; $y--) { $bw.Write($raw, $y * $stride, $w * 4) }
    $bw.Write((New-Object 'Byte[]' ($maskStride * $h)))  # AND mask: alpha does the work
    $bw.Flush()
    $bytes = $ms.ToArray()
    $bw.Dispose()
    $ms.Dispose()
    # Leading comma: a bare `return $bytes` unrolls the array into the pipeline,
    # and the caller gets an Object[] that BinaryWriter then writes through its
    # char[] overload — every byte above 0x7F silently UTF-8 expanded.
    return , $bytes
}

# ── Assemble the .ico container ───────────────────────────────────────────
# ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per size + payloads.
$images = @()
foreach ($size in $sizes) {
    $bmp = Render-Scaled -size $size
    if ($size -ge 128) {
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $ms.ToArray()
        $ms.Dispose()
    } else {
        $bytes = ConvertTo-Dib -bmp $bmp
    }
    $images += , @{ size = $size; bytes = $bytes }
    $bmp.Dispose()
}

$ms  = New-Object System.IO.MemoryStream
$bw  = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type: icon
$bw.Write([UInt16]$images.Count)

$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
    $dim = if ($img.size -ge 256) { 0 } else { $img.size }
    $bw.Write([Byte]$dim)            # width
    $bw.Write([Byte]$dim)            # height
    $bw.Write([Byte]0)               # palette count
    $bw.Write([Byte]0)               # reserved
    $bw.Write([UInt16]1)             # colour planes
    $bw.Write([UInt16]32)            # bits per pixel
    $bw.Write([UInt32]$img.bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $img.bytes.Length
}
foreach ($img in $images) { $bw.Write([Byte[]]$img.bytes) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($outPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()

Write-Output "icon.ico written: $outPath ($((Get-Item $outPath).Length) bytes, $($images.Count) sizes)"

# A PNG next to it, for the README and any non-Windows packaging target.
$png = Render-Scaled -size 512
$png.Save((Join-Path $PSScriptRoot 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()
Write-Output "icon.png written (512px)"
