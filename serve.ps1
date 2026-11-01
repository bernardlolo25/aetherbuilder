# PowerShell Static HTTP Web Server for AetherBuilder with API Emulation
param([int]$Port = 3000)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "AetherBuilder server running at http://localhost:$Port/"

$scriptDir = $PSScriptRoot
$dataDir = Join-Path $scriptDir "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
$siteFile = Join-Path $dataDir "site.json"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".pdf"  = "application/pdf"
    ".wasm" = "application/wasm"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            $urlPath = $request.Url.LocalPath.TrimStart('/')
            if ([string]::IsNullOrEmpty($urlPath) -or $urlPath -eq "/") {
                $urlPath = "index.html"
            }

            # Emulate api.php endpoints in PowerShell when running locally!
            if ($urlPath -eq "api.php") {
                $action = $request.QueryString["action"]
                $response.ContentType = "application/json; charset=utf-8"

                $uploadsDir = Join-Path $scriptDir "assets\uploads"
                if (-not (Test-Path $uploadsDir)) {
                    New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null
                }

                if ($action -eq "status") {
                    $hasSite = Test-Path $siteFile
                    $json = @{ success = $true; has_published_site = $hasSite; argon2_supported = $true; local_emulated = $true } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "get_site") {
                    $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
                    $response.Headers.Add("Pragma", "no-cache")
                    $response.Headers.Add("Expires", "0")
                    if (Test-Path $siteFile) {
                        $bytes = [System.IO.File]::ReadAllBytes($siteFile)
                        # Strip UTF-8 BOM (EF BB BF) if present to prevent json_decode failure
                        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
                            $bytes = $bytes[3..($bytes.Length - 1)]
                        }
                    } else {
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"sections":[]}')
                    }
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }

                elseif ($action -eq "list_assets") {
                    $allowedExts = @(".jpg",".jpeg",".png",".gif",".webp",".svg",".mp4",".webm",".pdf",".json")
                    $assets = @()
                    if (Test-Path $uploadsDir) {
                        Get-ChildItem -Path $uploadsDir -File | Where-Object {
                            $allowedExts -contains $_.Extension.ToLower()
                        } | Sort-Object LastWriteTime -Descending | ForEach-Object {
                            $assets += @{
                                name     = $_.Name
                                url      = "assets/uploads/" + $_.Name
                                size     = $_.Length
                                ext      = $_.Extension.TrimStart(".").ToLower()
                                modified = $_.LastWriteTime.ToString("o")
                            }
                        }
                    }
                    $json = @{ success = $true; assets = $assets } | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "upload" -and $request.HttpMethod -eq "POST") {
                    try {
                        # Read entire multipart body as raw bytes
                        $contentLength = $request.ContentLength64
                        $bodyBytes = New-Object byte[] $contentLength
                        $totalRead = 0
                        while ($totalRead -lt $contentLength) {
                            $read = $request.InputStream.Read($bodyBytes, $totalRead, $contentLength - $totalRead)
                            if ($read -le 0) { break }
                            $totalRead += $read
                        }

                        # Parse Content-Type boundary
                        $ct = $request.ContentType
                        $boundaryMatch = [regex]::Match($ct, 'boundary=([^;]+)')
                        if (-not $boundaryMatch.Success) { throw "No boundary found in Content-Type" }
                        $boundaryStr  = $boundaryMatch.Groups[1].Value.Trim().Trim('"')
                        $boundaryLine = "--" + $boundaryStr

                        # Use ISO-8859-1 (Latin1) via GetEncoding for PS5 compatibility
                        $latin1 = [System.Text.Encoding]::GetEncoding(28591)
                        $bodyStr = $latin1.GetString($bodyBytes)

                        # Split parts by boundary
                        $parts = $bodyStr -split ([regex]::Escape($boundaryLine))
                        $savedFile = $null

                        foreach ($part in $parts) {
                            if ($part -notmatch 'Content-Disposition:.*filename="([^"]+)"') { continue }
                            $originalName = $Matches[1]
                            $ext = [System.IO.Path]::GetExtension($originalName).ToLower()
                            $allowedExts = @(".jpg",".jpeg",".png",".gif",".webp",".svg",".mp4",".webm",".pdf",".json")
                            if ($allowedExts -notcontains $ext) { continue }

                            # Find where file data starts (after double CRLF \r\n\r\n)
                            $headerEnd = $part.IndexOf("`r`n`r`n")
                            if ($headerEnd -lt 0) { continue }
                            $dataStart = $headerEnd + 4

                            # Strip trailing CRLF before next boundary
                            $dataEnd = $part.Length
                            if ($part.EndsWith("`r`n")) { $dataEnd -= 2 }
                            $fileLen = $dataEnd - $dataStart
                            if ($fileLen -le 0) { continue }

                            $fileData  = $part.Substring($dataStart, $fileLen)
                            $fileBytes = $latin1.GetBytes($fileData)

                            # Check if overwrite flag was requested
                            $isOverwrite = ($bodyStr -match 'name="overwrite"[\r\n]+1')

                            $baseName  = [System.IO.Path]::GetFileNameWithoutExtension($originalName) -replace '[^a-zA-Z0-9_\-]', '_'
                            if ($isOverwrite) {
                                $destName = "${baseName}${ext}"
                            } else {
                                if (Test-Path (Join-Path $uploadsDir "${baseName}${ext}")) {
                                    $counter = 1
                                    while (Test-Path (Join-Path $uploadsDir "${baseName}-${counter}${ext}")) {
                                        $counter++
                                    }
                                    $destName = "${baseName}-${counter}${ext}"
                                } else {
                                    $destName = "${baseName}${ext}"
                                }
                            }
                            $destPath  = Join-Path $uploadsDir $destName
                            [System.IO.File]::WriteAllBytes($destPath, $fileBytes)

                            $savedFile = @{
                                success = $true
                                name    = $destName
                                url     = "assets/uploads/" + $destName
                                size    = $fileBytes.Length
                            }
                            Write-Host "Uploaded: $destName ($($fileBytes.Length) bytes)"
                            break
                        }

                        if ($savedFile) {
                            $json = $savedFile | ConvertTo-Json
                        } else {
                            $json = '{"success":false,"error":"No valid file found in upload."}'
                        }
                    } catch {
                        Write-Host "Upload error: $_"
                        $json = '{"success":false,"error":"Upload failed: ' + $_ + '"}'
                    }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                    $response.OutputStream.Flush()
                }
                elseif ($action -eq "delete_asset" -and $request.HttpMethod -eq "POST") {
                    $buffer = New-Object byte[] $request.ContentLength64
                    $request.InputStream.Read($buffer, 0, $request.ContentLength64) | Out-Null
                    $body = [System.Text.Encoding]::UTF8.GetString($buffer)
                    $parsed = $body | ConvertFrom-Json
                    $targetFile = Join-Path $uploadsDir ([System.IO.Path]::GetFileName($parsed.name))
                    if (Test-Path $targetFile) {
                        Remove-Item $targetFile -Force
                        $json = '{"success":true,"message":"Asset deleted."}'
                    } else {
                        $json = '{"success":false,"error":"File not found."}'
                    }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "publish" -and $request.HttpMethod -eq "POST") {
                    $bodyBytes = New-Object byte[] $request.ContentLength64
                    $bytesRead = 0
                    while ($bytesRead -lt $request.ContentLength64) {
                        $read = $request.InputStream.Read($bodyBytes, $bytesRead, $request.ContentLength64 - $bytesRead)
                        if ($read -le 0) { break }
                        $bytesRead += $read
                    }

                    if ($bytesRead -gt 0) {
                        [System.IO.File]::WriteAllBytes($siteFile, $bodyBytes)
                        Write-Host "Published $bytesRead bytes directly to site.json"

                        $revDir = Join-Path $dataDir "revisions"
                        if (-not (Test-Path $revDir)) { New-Item -ItemType Directory -Path $revDir -Force | Out-Null }
                        $revId = "rev_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
                        $revFile = Join-Path $revDir "$revId.json"
                        [System.IO.File]::WriteAllBytes($revFile, $bodyBytes)

                        # Keep last 30 revisions
                        $revList = Get-ChildItem -Path $revDir -Filter "rev_*.json" | Sort-Object Name
                        if ($revList.Count -gt 30) {
                            $revList | Select-Object -First ($revList.Count - 30) | Remove-Item -Force
                        }
                    }

                    $resJson = '{"success":true,"message":"Multi-page site published to site.json"}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                    $response.OutputStream.Flush()
                }
                elseif ($action -eq "login") {
                    $resJson = @{ success = $true; message = "Local login authenticated" } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "get_revisions") {
                    $revDir = Join-Path $dataDir "revisions"
                    $revs = @()
                    if (Test-Path $revDir) {
                        Get-ChildItem -Path $revDir -Filter "rev_*.json" | Sort-Object Name -Descending | ForEach-Object {
                            try {
                                $raw = Get-Content -Raw -Path $_.FullName -Encoding UTF8
                                $parsed = $raw | ConvertFrom-Json
                                $pgCount = if ($parsed.pages) { ($parsed.pages | Measure-Object).Count } else { 1 }
                                $secCount = 0
                                if ($parsed.pages) {
                                    foreach ($p in $parsed.pages) {
                                        if ($p.sections) { $secCount += ($p.sections | Measure-Object).Count }
                                    }
                                }
                                $sName = if ($parsed.siteSettings -and $parsed.siteSettings.siteName) { $parsed.siteSettings.siteName } else { "AetherBuilder Site" }
                                $revs += @{
                                    id            = $_.BaseName
                                    timestamp     = $_.LastWriteTime.ToString("o")
                                    formattedDate = $_.LastWriteTime.ToString("MMM d, yyyy h:mm:ss tt")
                                    sizeBytes     = $_.Length
                                    pageCount     = $pgCount
                                    totalSections = $secCount
                                    siteName      = $sName
                                }
                            } catch {}
                        }
                    }
                    $resJson = @{ success = $true; revisions = $revs; total = $revs.Count } | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "rollback_revision" -and $request.HttpMethod -eq "POST") {
                    $buffer = New-Object byte[] $request.ContentLength64
                    $request.InputStream.Read($buffer, 0, $request.ContentLength64) | Out-Null
                    $bodyStr = [System.Text.Encoding]::UTF8.GetString($buffer)
                    $inputData = $bodyStr | ConvertFrom-Json
                    $revId = $inputData.revisionId
                    $revDir = Join-Path $dataDir "revisions"
                    $targetRev = Join-Path $revDir "$revId.json"
                    if (Test-Path $targetRev) {
                        $raw = Get-Content -Raw -Path $targetRev -Encoding UTF8
                        Set-Content -Path $siteFile -Value $raw -Encoding UTF8
                        $parsed = $raw | ConvertFrom-Json
                        $resJson = @{ success = $true; message = "Rolled back to revision $revId"; siteData = $parsed } | ConvertTo-Json -Depth 10
                    } else {
                        $resJson = @{ success = $false; error = "Revision not found" } | ConvertTo-Json
                    }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "submit_form" -and $request.HttpMethod -eq "POST") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    $subs = @()
                    if (Test-Path $subFile) {
                        try {
                            $subs = Get-Content -Raw -Path $subFile -Encoding UTF8 | ConvertFrom-Json
                            if ($subs -isnot [System.Array]) { $subs = @($subs) }
                        } catch { $subs = @() }
                    }
                    $buffer = New-Object byte[] $request.ContentLength64
                    $request.InputStream.Read($buffer, 0, $request.ContentLength64) | Out-Null
                    $bodyStr = [System.Text.Encoding]::UTF8.GetString($buffer)
                    $entry = $bodyStr | ConvertFrom-Json

                    # Anti-spam honeypot
                    if (-not [string]::IsNullOrEmpty($entry._hp) -or -not [string]::IsNullOrEmpty($entry.website_hp)) {
                        $resJson = @{ success = $true; message = "Submission logged." } | ConvertTo-Json
                        $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.ContentLength64 = $buf.Length
                        $response.OutputStream.Write($buf, 0, $buf.Length)
                        $response.Close()
                        continue
                    }

                    $subId = "sub_" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + "_" + (Get-Random -Minimum 1000 -Maximum 9999)
                    $entryObj = [PSCustomObject]@{
                        id           = $subId
                        submitted_at = (Get-Date).ToString("o")
                        is_read      = $false
                    }
                    foreach ($prop in $entry.PSObject.Properties) {
                        if ($prop.Name -ne "_hp" -and $prop.Name -ne "website_hp") {
                            Add-Member -InputObject $entryObj -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
                        }
                    }
                    $newSubs = @($entryObj) + $subs
                    $newSubs | ConvertTo-Json -Depth 6 | Set-Content -Path $subFile -Encoding UTF8
                    $resJson = @{ success = $true; id = $subId; message = "Registration submission received successfully!" } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "get_submissions") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    $raw = if (Test-Path $subFile) { Get-Content -Raw -Path $subFile -Encoding UTF8 } else { "[]" }
                    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = "[]" }
                    $unread = 0
                    $tot = 0
                    try {
                        $parsed = $raw | ConvertFrom-Json
                        if ($parsed -is [System.Array]) {
                            foreach ($s in $parsed) { if (-not $s.is_read) { $unread++ } }
                            $tot = $parsed.Count
                        } elseif ($parsed) {
                            if (-not $parsed.is_read) { $unread = 1 }
                            $tot = 1
                        }
                    } catch {}
                    $resJson = "{`"success`":true,`"unreadCount`":$unread,`"totalCount`":$tot,`"submissions`":$raw}"
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "mark_read" -and $request.HttpMethod -eq "POST") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    $subs = @()
                    if (Test-Path $subFile) {
                        try {
                            $subs = Get-Content -Raw -Path $subFile -Encoding UTF8 | ConvertFrom-Json
                            if ($subs -isnot [System.Array]) { $subs = @($subs) }
                        } catch { $subs = @() }
                    }
                    $buffer = New-Object byte[] $request.ContentLength64
                    $request.InputStream.Read($buffer, 0, $request.ContentLength64) | Out-Null
                    $bodyStr = [System.Text.Encoding]::UTF8.GetString($buffer)
                    $inputData = $bodyStr | ConvertFrom-Json
                    $targetId = if ($inputData.id) { $inputData.id } else { "" }
                    foreach ($s in $subs) {
                        if (-not $targetId -or $s.id -eq $targetId) {
                            $s.is_read = $true
                        }
                    }
                    $subs | ConvertTo-Json -Depth 6 | Set-Content -Path $subFile -Encoding UTF8
                    $resJson = @{ success = $true } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "delete_submission" -and $request.HttpMethod -eq "POST") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    $subs = @()
                    if (Test-Path $subFile) {
                        try {
                            $subs = Get-Content -Raw -Path $subFile -Encoding UTF8 | ConvertFrom-Json
                            if ($subs -isnot [System.Array]) { $subs = @($subs) }
                        } catch { $subs = @() }
                    }
                    $buffer = New-Object byte[] $request.ContentLength64
                    $request.InputStream.Read($buffer, 0, $request.ContentLength64) | Out-Null
                    $bodyStr = [System.Text.Encoding]::UTF8.GetString($buffer)
                    $inputData = $bodyStr | ConvertFrom-Json
                    $targetId = $inputData.id
                    $filtered = @($subs | Where-Object { $_.id -ne $targetId })
                    $filtered | ConvertTo-Json -Depth 6 | Set-Content -Path $subFile -Encoding UTF8
                    $resJson = @{ success = $true } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "export_submissions_csv") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    $subs = @()
                    if (Test-Path $subFile) {
                        try {
                            $subs = Get-Content -Raw -Path $subFile -Encoding UTF8 | ConvertFrom-Json
                            if ($subs -isnot [System.Array]) { $subs = @($subs) }
                        } catch { $subs = @() }
                    }
                    $response.ContentType = "text/csv; charset=utf-8"
                    $response.Headers.Add("Content-Disposition", "attachment; filename=`"submissions_" + (Get-Date).ToString("yyyy-MM-dd_HHmmss") + ".csv`"")
                    $csvLines = @("`"ID`",`"Date Submitted`",`"Status`",`"Source`",`"Name`",`"Email`",`"Phone`",`"Page`",`"Message`"")
                    foreach ($s in $subs) {
                        $st = if ($s.is_read) { "Read" } else { "New" }
                        $esc = { param($val) if ($val) { '"' + ($val.ToString().Replace('"', '""')) + '"' } else { '""' } }
                        $csvLines += "$(& $esc $s.id),$(& $esc $s.submitted_at),$(& $esc $st),$(& $esc $s.type),$(& $esc $s.name),$(& $esc $s.email),$(& $esc $s.phone),$(& $esc $s.page),$(& $esc $s.message)"
                    }
                    $csvText = [char]0xFEFF + ($csvLines -join "`r`n")
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($csvText)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "clear_submissions" -and $request.HttpMethod -eq "POST") {
                    $subFile = Join-Path $dataDir "submissions.json"
                    "[]" | Set-Content -Path $subFile -Encoding UTF8
                    $resJson = @{ success = $true; message = "Submissions cleared." } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "get_addons") {
                    $addonsFile = Join-Path $dataDir "addons.json"
                    $raw = if (Test-Path $addonsFile) { Get-Content -Raw -Path $addonsFile -Encoding UTF8 } else { "[]" }
                    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = "[]" }
                    $resJson = "{`"success`":true,`"addons`":$raw}"
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($action -eq "save_addons" -and $request.HttpMethod -eq "POST") {
                    $addonsFile = Join-Path $dataDir "addons.json"
                    $bodyBytes = New-Object byte[] $request.ContentLength64
                    $bytesRead = 0
                    while ($bytesRead -lt $request.ContentLength64) {
                        $read = $request.InputStream.Read($bodyBytes, $bytesRead, $request.ContentLength64 - $bytesRead)
                        if ($read -le 0) { break }
                        $bytesRead += $read
                    }
                    if ($bytesRead -gt 0) {
                        [System.IO.File]::WriteAllBytes($addonsFile, $bodyBytes)
                    }
                    $resJson = '{"success":true,"message":"Add-ons saved successfully"}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                else {
                    $resJson = @{ success = $true } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }

                $response.Close()
                continue
            }

            $filePath = Join-Path $scriptDir $urlPath

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                $response.ContentType = $contentType

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File Not Found: $urlPath")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
        } catch {
            Write-Host "Request error: $_"
        } finally {
            try { $response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
