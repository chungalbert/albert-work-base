#requires -Version 5.1
<#
.SYNOPSIS
    WHEA Hardware Analyzer GUI

.DESCRIPTION
    讀取匯出的 System.evtx，搜尋 Microsoft-Windows-WHEA-Logger Warning，
    列出 PCIe BDF / HeaderLog / AER 狀態，並解碼 PCIe TLP Header。

    此版本專為 PS2EXE + requireAdmin + noConsole 執行環境優化。

.VERSION
    1.3.1.0

.COPYRIGHT
    版權所有 Compal KS SW
#>

# ============================================================
# Global settings
# ============================================================

$script:ToolVersion = "1.3.1.0"
$script:CompanyName = "Compal KS SW"
$script:ProductName = "WHEA Hardware Analyzer"
$script:CopyrightText = "版權所有 Compal KS SW"
$script:Running = $false
$script:AllowClose = $false
$script:DebugEnabled = $false
$script:SessionId = (Get-Date -Format "yyyyMMdd_HHmmss_fff")

# PS2EXE 執行環境下，使用 EXE 所在路徑。
$script:ToolDir = [System.AppContext]::BaseDirectory

if ([string]::IsNullOrWhiteSpace($script:ToolDir)) {
    $script:ToolDir = (Get-Location).Path
}

try {
    $script:ToolDir = [System.IO.Path]::GetFullPath($script:ToolDir)
}
catch {
    $script:ToolDir = (Get-Location).Path
}

$script:DebugLogPath = Join-Path $script:ToolDir "tools.log"
$script:TsettingPath = Join-Path $script:ToolDir "Tsetting.txt"

# ============================================================
# Assembly
# ============================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# ============================================================
# Language
# ============================================================

function Get-AppLanguage {
    try {
        $culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name

        if ($culture -match '^(zh-TW|zh-HK|zh-MO)') {
            return "zh-TW"
        }

        if ($culture -match '^(zh-CN|zh-SG)') {
            return "zh-CN"
        }
    }
    catch {
    }

    return "en-US"
}

$script:Lang = Get-AppLanguage

$script:Text = @{
    "en-US" = @{
        Title = "WHEA Hardware Analyzer"
        AnalysisTab = "Analysis"
        HelpTab = "Help"
        SourceGroup = "Input"
        EvtxLabel = "System.evtx:"
        Browse = "Import File"
        Analyze = "Start"
        Exit = "Exit"
        StatusReady = "Ready"
        StatusLoading = "Loading WHEA events..."
        StatusAnalyzing = "Analyzing events..."
        StatusWriting = "Writing reports..."
        StatusDone = "Completed"
        StatusFailed = "Failed"
        SummaryGroup = "Summary"
        Found = "WHEA events"
        WithHeader = "With HeaderLog"
        Output = "Output"
        GridTime = "Time"
        GridEvent = "Event"
        GridType = "Type"
        GridLocation = "Location / BDF"
        GridVIDDID = "VID:DID"
        GridKeyData = "Key data"
        GridHeader = "HeaderLog"
        GridCmd = "TLP"
        GridTarget = "Target"
        GridDecode = "Decoded"
        SelectEvtx = "Select System.evtx"
        NeedFile = "Please select a valid .evtx file."
        AdminRequired = "This tool requires Administrator privileges."
        ErrorTitle = "Error"
        DoneTitle = "Completed"
        DoneMessage = "Analysis completed."
        HelpText = @"
Purpose
• Intel / AMD common WHEA hardware-error analyzer.
• Read an exported System.evtx and find Microsoft-Windows-WHEA-Logger Error / Warning events.
• Automatically classify PCIe AER, Processor MCA/MCE/SMCA, Memory, Firmware/CPER and other WHEA records.
• PCIe records retain BDF / AER / HeaderLog / TLP decoding.
• Processor records show APIC ID, MCA bank, MCi_STATUS, MCi_ADDR, MCi_MISC and common MCA status flags when available.
• Memory records show physical address and topology fields when Windows exposes them.
• Firmware records identify CPER RawData and preserve the original data for follow-up analysis.

Intel / AMD
• PCIe AER decoding is vendor independent.
• Processor MCA decoding uses common x86/x64 status fields and works with Intel MCA and AMD MCA/SMCA events.
• Vendor/model-specific MCA syndrome meanings are intentionally kept as raw values unless Windows exposes a readable ErrorType.

How to use
1. Click Import File and select System.evtx.
2. Click Start.
3. Wait until the progress bar reaches 100%.
4. TXT and HTML reports are created beside this EXE.

Output
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.txt
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.html

Version: 1.3.1.0
"@
    }

    "zh-TW" = @{
        Title = "WHEA 硬體錯誤分析工具"
        AnalysisTab = "分析"
        HelpTab = "使用說明"
        SourceGroup = "輸入來源"
        EvtxLabel = "System.evtx："
        Browse = "匯入檔案"
        Analyze = "開始執行"
        Exit = "離開"
        StatusReady = "就緒"
        StatusLoading = "正在讀取 WHEA 事件..."
        StatusAnalyzing = "正在分析事件..."
        StatusWriting = "正在輸出報告..."
        StatusDone = "完成"
        StatusFailed = "失敗"
        SummaryGroup = "分析摘要"
        Found = "WHEA 事件"
        WithHeader = "含 HeaderLog"
        Output = "輸出檔案"
        GridTime = "時間"
        GridEvent = "事件"
        GridType = "類型"
        GridLocation = "位置 / BDF"
        GridVIDDID = "VID:DID"
        GridKeyData = "關鍵資料"
        GridHeader = "HeaderLog"
        GridCmd = "TLP 指令"
        GridTarget = "目標"
        GridDecode = "解讀"
        SelectEvtx = "選擇 System.evtx"
        NeedFile = "請選擇有效的 .evtx 檔案。"
        AdminRequired = "此工具需要系統管理員權限。"
        ErrorTitle = "錯誤"
        DoneTitle = "完成"
        DoneMessage = "分析完成。"
        HelpText = @"
用途
• Intel / AMD 通用 WHEA 硬體錯誤分析。
• 讀取匯出的 System.evtx，搜尋 Microsoft-Windows-WHEA-Logger 的 Error / Warning 事件。
• 自動分類 PCIe AER、Processor MCA/MCE/SMCA、Memory、Firmware/CPER 與其他 WHEA。
• PCIe 類型保留 BDF、AER Status、HeaderLog 與 TLP 解碼。
• Processor 類型會列出 APIC ID、MCA Bank、MCi_STATUS、MCi_ADDR、MCi_MISC，並在資料存在時解讀共通 MCA Status flags。
• Memory 類型會列出 Windows 事件中可取得的 Physical Address、Node、Bank、Module、Row、Column 等欄位。
• Firmware 類型會辨識 CPER RawData，保留原始資料供後續分析。

Intel / AMD 支援
• PCIe AER / TLP 解碼與 CPU 廠牌無關，Intel / AMD 平台皆可使用。
• Processor MCA 解碼採 x86/x64 共通欄位，可分析 Intel MCA 與 AMD MCA/SMCA WHEA。
• 廠牌 / CPU Family 專屬 syndrome 不任意猜測；Windows 沒有提供可讀 ErrorType 時會保留原始數值。

使用方式
1. 點選「匯入檔案」選擇 System.evtx。
2. 點選「開始執行」。
3. 等待進度條到達 100%。
4. TXT 與 HTML 報告會輸出在本工具 EXE 的同一目錄。

輸出檔案
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.txt
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.html

版本：1.3.1.0
"@
    }

    "zh-CN" = @{
        Title = "WHEA 硬件错误分析工具"
        AnalysisTab = "分析"
        HelpTab = "使用说明"
        SourceGroup = "输入来源"
        EvtxLabel = "System.evtx："
        Browse = "导入文件"
        Analyze = "开始执行"
        Exit = "退出"
        StatusReady = "就绪"
        StatusLoading = "正在读取 WHEA 事件..."
        StatusAnalyzing = "正在分析事件..."
        StatusWriting = "正在输出报告..."
        StatusDone = "完成"
        StatusFailed = "失败"
        SummaryGroup = "分析摘要"
        Found = "WHEA 事件"
        WithHeader = "含 HeaderLog"
        Output = "输出文件"
        GridTime = "时间"
        GridEvent = "事件"
        GridType = "类型"
        GridLocation = "位置 / BDF"
        GridVIDDID = "VID:DID"
        GridKeyData = "关键数据"
        GridHeader = "HeaderLog"
        GridCmd = "TLP 指令"
        GridTarget = "目标"
        GridDecode = "解读"
        SelectEvtx = "选择 System.evtx"
        NeedFile = "请选择有效的 .evtx 文件。"
        AdminRequired = "此工具需要管理员权限。"
        ErrorTitle = "错误"
        DoneTitle = "完成"
        DoneMessage = "分析完成。"
        HelpText = @"
用途
• Intel / AMD 通用 WHEA 硬件错误分析。
• 读取导出的 System.evtx，搜索 Microsoft-Windows-WHEA-Logger 的 Error / Warning 事件。
• 自动分类 PCIe AER、Processor MCA/MCE/SMCA、Memory、Firmware/CPER 与其他 WHEA。
• PCIe 类型保留 BDF、AER Status、HeaderLog 与 TLP 解码。
• Processor 类型会列出 APIC ID、MCA Bank、MCi_STATUS、MCi_ADDR、MCi_MISC，并在数据存在时解读共通 MCA Status flags。
• Memory 类型会列出 Windows 事件中可取得的 Physical Address、Node、Bank、Module、Row、Column 等字段。
• Firmware 类型会识别 CPER RawData，并保留原始数据供后续分析。

Intel / AMD 支持
• PCIe AER / TLP 解码与 CPU 品牌无关，Intel / AMD 平台皆可使用。
• Processor MCA 解码采用 x86/x64 共通字段，可分析 Intel MCA 与 AMD MCA/SMCA WHEA。
• 品牌 / CPU Family 专属 syndrome 不任意猜测；Windows 没有提供可读 ErrorType 时会保留原始数值。

使用方式
1. 点击“导入文件”选择 System.evtx。
2. 点击“开始执行”。
3. 等待进度条到达 100%。
4. TXT 与 HTML 报告会输出在本工具 EXE 的同一目录。

输出文件
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.txt
• WHEA_Hardware_Report_yyyyMMdd_HHmmss_fff.html

版本：1.3.1.0
"@
    }
}

function T {
    param([string]$Key)

    if ($script:Text.ContainsKey($script:Lang) -and $script:Text[$script:Lang].ContainsKey($Key)) {
        return $script:Text[$script:Lang][$Key]
    }

    return $script:Text["en-US"][$Key]
}

# ============================================================
# Debug mechanism
# ============================================================

function Initialize-DebugMode {
    $script:DebugEnabled = $false

    try {
        if (Test-Path -LiteralPath $script:TsettingPath -PathType Leaf) {
            $lines = Get-Content -LiteralPath $script:TsettingPath -ErrorAction Stop

            foreach ($line in $lines) {
                # 僅針對「檔案內容」做比對；檔案路徑不進入 Regex。
                if ([string]$line -match '^\s*debug_on\s*=\s*1\s*$') {
                    $script:DebugEnabled = $true
                    break
                }
            }
        }
    }
    catch {
        $script:DebugEnabled = $false
    }
}

function Write-DebugLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    if (-not $script:DebugEnabled) {
        return
    }

    try {
        $line = "{0} [{1}] [{2}] [{3}] {4}" -f `
            (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"),
            $script:SessionId,
            $Level,
            $script:ToolVersion,
            $Message

        Add-Content -LiteralPath $script:DebugLogPath -Value $line -Encoding UTF8
    }
    catch {
        # Debug log 不得影響主要功能。
    }
}

Initialize-DebugMode
Write-DebugLog "Application start. ToolDir=$($script:ToolDir)"

# ============================================================
# Execution policy / Admin
# ============================================================

try {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
    Write-DebugLog "ExecutionPolicy Process=Bypass OK."
}
catch {
    Write-DebugLog "ExecutionPolicy Process=Bypass failed: $($_.Exception.Message)" "WARN"
}

function Test-IsAdministrator {
    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)

        return $principal.IsInRole(
            [System.Security.Principal.WindowsBuiltInRole]::Administrator
        )
    }
    catch {
        return $false
    }
}

if (-not (Test-IsAdministrator)) {
    [System.Windows.Forms.MessageBox]::Show(
        (T "AdminRequired"),
        (T "ErrorTitle"),
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null

    [Environment]::Exit(0)
}

# ============================================================
# Utility
# ============================================================

function Convert-ToUInt64Safe {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    $s = ([string]$Value).Trim()

    if ([string]::IsNullOrWhiteSpace($s)) {
        return $null
    }

    try {
        if ($s -match '^(?i)0x([0-9a-f]+)$') {
            return [Convert]::ToUInt64($Matches[1], 16)
        }

        if ($s -match '^(?i)([0-9a-f]+)h$') {
            return [Convert]::ToUInt64($Matches[1], 16)
        }

        return [Convert]::ToUInt64($s, 10)
    }
    catch {
        return $null
    }
}

function Format-HexValue {
    param(
        [object]$Value,
        [int]$Digits = 8
    )

    $v = Convert-ToUInt64Safe $Value

    if ($null -eq $v) {
        return "N/A"
    }

    return ("0x{0:X$Digits}" -f $v)
}

function Reverse-DwordHexBytes {
    param([string]$Hex8)

    if ($Hex8.Length -ne 8) {
        return $Hex8
    }

    return (
        $Hex8.Substring(6,2) +
        $Hex8.Substring(4,2) +
        $Hex8.Substring(2,2) +
        $Hex8.Substring(0,2)
    )
}

function Format-RidTraditional {
    param([UInt16]$Rid)

    $bus = ($Rid -shr 8) -band 0xFF
    $dev = ($Rid -shr 3) -band 0x1F
    $fun = $Rid -band 0x07

    return ("{0:X2}:{1:X2}.{2:X1}" -f $bus, $dev, $fun)
}

function Format-RidAri {
    param([UInt16]$Rid)

    $bus = ($Rid -shr 8) -band 0xFF
    $fun = $Rid -band 0xFF

    return ("Bus {0:X2}, ARI Function 0x{1:X2} ({2})" -f $bus, $fun, $fun)
}

function Get-EventDataMap {
    param($Event)

    [xml]$xml = $Event.ToXml()
    $map = @{}
    $index = 0

    if ($null -ne $xml.Event.EventData -and $null -ne $xml.Event.EventData.Data) {
        foreach ($node in @($xml.Event.EventData.Data)) {
            $name = $null
            $value = $null

            if ($node -is [System.Xml.XmlElement]) {
                $name = $node.GetAttribute("Name")
                $value = $node.InnerText
            }
            else {
                $nameProp = $node.PSObject.Properties["Name"]

                if ($null -ne $nameProp) {
                    $name = [string]$nameProp.Value
                }

                $innerTextProp = $node.PSObject.Properties["InnerText"]

                if ($null -ne $innerTextProp) {
                    $value = [string]$innerTextProp.Value
                }
                else {
                    $textProp = $node.PSObject.Properties["#text"]

                    if ($null -ne $textProp) {
                        $value = [string]$textProp.Value
                    }
                    else {
                        $value = [string]$node
                    }
                }
            }

            if ([string]::IsNullOrWhiteSpace($name)) {
                $name = "Data$index"
            }

            if ($null -eq $value) {
                $value = ""
            }

            $map[$name] = [string]$value
            $index++
        }
    }

    return $map
}

# ============================================================
# PCIe TLP Decode
# ============================================================

function Get-TlpTypeInfo {
    param([UInt32]$Dw0)

    $fmt  = ($Dw0 -shr 29) -band 0x7
    $type = ($Dw0 -shr 24) -band 0x1F

    $name = "Unknown"
    $known = $false

    switch ($type) {
        0x00 {
            switch ($fmt) {
                0 { $name = "MRd32"; $known = $true }
                1 { $name = "MRd64"; $known = $true }
                2 { $name = "MWr32"; $known = $true }
                3 { $name = "MWr64"; $known = $true }
            }
        }

        0x01 {
            switch ($fmt) {
                0 { $name = "MRdLk32"; $known = $true }
                1 { $name = "MRdLk64"; $known = $true }
            }
        }

        0x02 {
            switch ($fmt) {
                0 { $name = "IORd"; $known = $true }
                2 { $name = "IOWr"; $known = $true }
            }
        }

        0x04 {
            switch ($fmt) {
                0 { $name = "CfgRd0"; $known = $true }
                2 { $name = "CfgWr0"; $known = $true }
            }
        }

        0x05 {
            switch ($fmt) {
                0 { $name = "CfgRd1"; $known = $true }
                2 { $name = "CfgWr1"; $known = $true }
            }
        }

        0x0A {
            switch ($fmt) {
                0 { $name = "Cpl";  $known = $true }
                2 { $name = "CplD"; $known = $true }
            }
        }

        0x0B {
            switch ($fmt) {
                0 { $name = "CplLk";  $known = $true }
                2 { $name = "CplDLk"; $known = $true }
            }
        }

        { $_ -ge 0x10 -and $_ -le 0x17 } {
            $name = "Message"
            $known = $true
        }
    }

    return [pscustomobject]@{
        Name  = $name
        Known = $known
        Fmt   = $fmt
        Type  = $type
    }
}

function Decode-PcieHeaderLog {
    param([string]$HeaderLog)

    $ret = [ordered]@{
        Valid                 = $false
        RawHeaderLog          = $HeaderLog
        ByteOrder             = ""
        RawDwords             = ""
        Dwords                = ""
        TlpType               = "N/A"
        LengthDw              = $null
        LengthBytes           = $null
        RequesterRid          = ""
        RequesterTraditional  = ""
        RequesterAri          = ""
        CompleterRid          = ""
        CompleterTraditional  = ""
        TargetTraditional     = ""
        TargetAri             = ""
        ConfigOffset          = ""
        Address               = ""
        CompletionStatus      = ""
        FirstBE               = ""
        LastBE                = ""
        Tag                   = ""
        Summary               = "N/A"
    }

    if ([string]::IsNullOrWhiteSpace($HeaderLog)) {
        if ($script:Lang -eq "en-US") {
            $ret.Summary = "No HeaderLog."
        }
        elseif ($script:Lang -eq "zh-CN") {
            $ret.Summary = "没有 HeaderLog。"
        }
        else {
            $ret.Summary = "沒有 HeaderLog。"
        }

        return [pscustomobject]$ret
    }

    $hex = ($HeaderLog -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()

    if ($hex.Length -lt 32) {
        if ($script:Lang -eq "en-US") {
            $ret.Summary = "HeaderLog is shorter than 16 bytes."
        }
        elseif ($script:Lang -eq "zh-CN") {
            $ret.Summary = "HeaderLog 长度不足 16 bytes。"
        }
        else {
            $ret.Summary = "HeaderLog 長度不足 16 bytes。"
        }

        return [pscustomobject]$ret
    }

    $hex = $hex.Substring(0, 32)

    $rawChunks = @(
        $hex.Substring(0, 8),
        $hex.Substring(8, 8),
        $hex.Substring(16, 8),
        $hex.Substring(24, 8)
    )

    $ret.RawDwords = ($rawChunks -join " ")

    $swapChunks = @(
        (Reverse-DwordHexBytes $rawChunks[0]),
        (Reverse-DwordHexBytes $rawChunks[1]),
        (Reverse-DwordHexBytes $rawChunks[2]),
        (Reverse-DwordHexBytes $rawChunks[3])
    )

    $directDw = @(
        [Convert]::ToUInt32($rawChunks[0], 16),
        [Convert]::ToUInt32($rawChunks[1], 16),
        [Convert]::ToUInt32($rawChunks[2], 16),
        [Convert]::ToUInt32($rawChunks[3], 16)
    )

    $swapDw = @(
        [Convert]::ToUInt32($swapChunks[0], 16),
        [Convert]::ToUInt32($swapChunks[1], 16),
        [Convert]::ToUInt32($swapChunks[2], 16),
        [Convert]::ToUInt32($swapChunks[3], 16)
    )

    $directType = Get-TlpTypeInfo $directDw[0]
    $swapType   = Get-TlpTypeInfo $swapDw[0]

    # Windows WHEA XML 常見為每 DWORD byte reversed。
    if ($swapType.Known -or -not $directType.Known) {
        $dw = $swapDw
        $typeInfo = $swapType
        $ret.ByteOrder = "Per-DWORD byte swap"
        $ret.Dwords = ($swapChunks | ForEach-Object { "0x$_" }) -join " "
    }
    else {
        $dw = $directDw
        $typeInfo = $directType
        $ret.ByteOrder = "Direct"
        $ret.Dwords = ($rawChunks | ForEach-Object { "0x$_" }) -join " "
    }

    $ret.Valid = $true
    $ret.TlpType = $typeInfo.Name

    $fmt = $typeInfo.Fmt
    $type = $typeInfo.Type

    $lenDw = [int]($dw[0] -band 0x3FF)

    if ($lenDw -eq 0) {
        $lenDw = 1024
    }

    $ret.LengthDw = $lenDw
    $ret.LengthBytes = $lenDw * 4

    $rid = [UInt16](($dw[1] -shr 16) -band 0xFFFF)
    $tag = [int](($dw[1] -shr 8) -band 0xFF)
    $lbe = [int](($dw[1] -shr 4) -band 0xF)
    $fbe = [int]($dw[1] -band 0xF)

    $ret.RequesterRid = ("0x{0:X4}" -f $rid)
    $ret.RequesterTraditional = Format-RidTraditional $rid
    $ret.RequesterAri = Format-RidAri $rid
    $ret.Tag = ("0x{0:X2}" -f $tag)
    $ret.LastBE = ("0x{0:X1}" -f $lbe)
    $ret.FirstBE = ("0x{0:X1}" -f $fbe)

    # Configuration Request
    if ($type -eq 0x04 -or $type -eq 0x05) {
        $bus = [int](($dw[2] -shr 24) -band 0xFF)
        $dev = [int](($dw[2] -shr 19) -band 0x1F)
        $fun = [int](($dw[2] -shr 16) -band 0x07)
        $ariFunc = [int](($dw[2] -shr 16) -band 0xFF)

        $extReg = [int](($dw[2] -shr 8) -band 0x0F)
        $regNum = [int](($dw[2] -shr 2) -band 0x3F)
        $offset = ($extReg -shl 8) -bor ($regNum -shl 2)

        $ret.TargetTraditional = ("{0:X2}:{1:X2}.{2:X1}" -f $bus, $dev, $fun)
        $ret.TargetAri = ("Bus {0:X2}, ARI Function 0x{1:X2} ({2})" -f $bus, $ariFunc, $ariFunc)
        $ret.ConfigOffset = ("0x{0:X3}" -f $offset)

        if ($script:Lang -eq "en-US") {
            $verb = if ($typeInfo.Name -match "Rd") { "read" } else { "write" }

            $ret.Summary = (
                "{0}: Requester {1} performs a PCI Configuration Space {2} to target {3}, offset {4}, length {5} DW ({6} bytes). " +
                "If ARI Forwarding was active, target can also be interpreted as {7}."
            ) -f $typeInfo.Name, $ret.RequesterTraditional, $verb, $ret.TargetTraditional, `
                $ret.ConfigOffset, $ret.LengthDw, $ret.LengthBytes, $ret.TargetAri

            if ($offset -eq 0 -and $typeInfo.Name -match "^CfgRd") {
                $ret.Summary += " Offset 0x000 normally reads Vendor ID / Device ID for presence/enumeration probing."
            }
        }
        elseif ($script:Lang -eq "zh-CN") {
            $verb = if ($typeInfo.Name -match "Rd") { "读取" } else { "写入" }

            $ret.Summary = (
                "{0}：Requester {1} 对 Target {2} 的 PCI Configuration Space {3} 执行{4}，Length={5} DW ({6} Bytes)。" +
                "若当时 ARI Forwarding 已启用，Target 也可解读为 {7}。"
            ) -f $typeInfo.Name, $ret.RequesterTraditional, $ret.TargetTraditional, `
                $ret.ConfigOffset, $verb, $ret.LengthDw, $ret.LengthBytes, $ret.TargetAri

            if ($offset -eq 0 -and $typeInfo.Name -match "^CfgRd") {
                $ret.Summary += " Offset 0x000 通常是在读取 Vendor ID / Device ID，常见于设备存在性或 PCI 枚举 probe。"
            }
        }
        else {
            $verb = if ($typeInfo.Name -match "Rd") { "讀取" } else { "寫入" }

            $ret.Summary = (
                "{0}：Requester {1} 對 Target {2} 的 PCI Configuration Space {3} 做{4}，Length={5} DW ({6} Bytes)。" +
                "若當時 ARI Forwarding 已啟用，Target 也可解讀為 {7}。"
            ) -f $typeInfo.Name, $ret.RequesterTraditional, $ret.TargetTraditional, `
                $ret.ConfigOffset, $verb, $ret.LengthDw, $ret.LengthBytes, $ret.TargetAri

            if ($offset -eq 0 -and $typeInfo.Name -match "^CfgRd") {
                $ret.Summary += " Offset 0x000 通常是在讀取 Vendor ID / Device ID，常見於裝置存在性或 PCI 列舉 probe。"
            }
        }
    }

    # Memory Request
    elseif ($type -eq 0x00) {
        [UInt64]$address = 0

        if ($fmt -eq 0 -or $fmt -eq 2) {
            $address = [UInt64]($dw[2] -band 0xFFFFFFFC)
        }
        elseif ($fmt -eq 1 -or $fmt -eq 3) {
            $address = ([UInt64]$dw[2] -shl 32) -bor ([UInt64]($dw[3] -band 0xFFFFFFFC))
        }

        $ret.Address = ("0x{0:X16}" -f $address)
        $verb = if ($typeInfo.Name -match "Rd") { "Memory Read" } else { "Memory Write" }

        $ret.Summary = (
            "{0}: Requester {1}, Address={2}, Length={3} DW ({4} Bytes)."
        ) -f $verb, $ret.RequesterTraditional, $ret.Address, $ret.LengthDw, $ret.LengthBytes
    }

    # I/O Request
    elseif ($type -eq 0x02) {
        $address = [UInt64]($dw[2] -band 0xFFFFFFFC)
        $ret.Address = ("0x{0:X8}" -f $address)

        $ret.Summary = (
            "{0}: Requester {1}, I/O Address={2}, Length={3} DW."
        ) -f $typeInfo.Name, $ret.RequesterTraditional, $ret.Address, $ret.LengthDw
    }

    # Completion
    elseif ($type -eq 0x0A -or $type -eq 0x0B) {
        $completer = [UInt16](($dw[1] -shr 16) -band 0xFFFF)
        $cplStatus = [int](($dw[1] -shr 13) -band 0x7)
        $byteCount = [int]($dw[1] -band 0xFFF)

        $reqRid = [UInt16](($dw[2] -shr 16) -band 0xFFFF)
        $cplTag = [int](($dw[2] -shr 8) -band 0xFF)
        $lowerAddress = [int]($dw[2] -band 0x7F)

        $statusText = switch ($cplStatus) {
            0 { "SC (Successful Completion)" }
            1 { "UR (Unsupported Request)" }
            2 { "CRS (Configuration Request Retry Status)" }
            4 { "CA (Completer Abort)" }
            default { "Reserved/Unknown ($cplStatus)" }
        }

        $ret.CompleterRid = ("0x{0:X4}" -f $completer)
        $ret.CompleterTraditional = Format-RidTraditional $completer
        $ret.CompletionStatus = $statusText
        $ret.RequesterRid = ("0x{0:X4}" -f $reqRid)
        $ret.RequesterTraditional = Format-RidTraditional $reqRid
        $ret.RequesterAri = Format-RidAri $reqRid
        $ret.Tag = ("0x{0:X2}" -f $cplTag)

        $ret.Summary = (
            "{0}: Completer {1} -> Requester {2}, Completion Status={3}, ByteCount={4}, LowerAddress=0x{5:X2}."
        ) -f $typeInfo.Name, $ret.CompleterTraditional, $ret.RequesterTraditional, `
            $statusText, $byteCount, $lowerAddress
    }

    elseif ($typeInfo.Name -eq "Message") {
        $ret.Summary = (
            "PCIe Message TLP: Fmt={0}, Type=0x{1:X2}, Length={2} DW."
        ) -f $fmt, $type, $ret.LengthDw
    }

    else {
        $ret.Summary = (
            "Unsupported/unknown TLP: Fmt={0}, Type=0x{1:X2}, DW0=0x{2:X8}."
        ) -f $fmt, $type, $dw[0]
    }

    return [pscustomobject]$ret
}


function Convert-ToHtmlSafe {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    try {
        return [System.Net.WebUtility]::HtmlEncode([string]$Value)
    }
    catch {
        return [string]$Value
    }
}


function Get-DataValue {
    param(
        [hashtable]$Data,
        [string[]]$Names,
        [string]$Default = ""
    )

    foreach ($name in $Names) {
        if ($Data.ContainsKey($name)) {
            $v = [string]$Data[$name]

            if (-not [string]::IsNullOrWhiteSpace($v)) {
                return $v
            }
        }
    }

    return $Default
}

function Get-EventMessageSafe {
    param($Event)

    try {
        $m = [string]$Event.Message

        if (-not [string]::IsNullOrWhiteSpace($m)) {
            return (($m -replace '\r?\n', ' ') -replace '\s{2,}', ' ').Trim()
        }
    }
    catch {
    }

    return ""
}

function Get-WheaCategory {
    param(
        $Event,
        [hashtable]$Data,
        [string]$Message
    )

    if (
        $Data.ContainsKey("HeaderLog") -or
        (
            $Data.ContainsKey("Bus") -and
            $Data.ContainsKey("Device") -and
            $Data.ContainsKey("Function") -and
            ($Data.ContainsKey("VendorID") -or $Data.ContainsKey("DeviceID"))
        )
    ) {
        return "PCIe AER"
    }

    if (
        $Data.ContainsKey("MciStat") -or
        $Data.ContainsKey("MciStatus") -or
        $Data.ContainsKey("MCABank") -or
        $Data.ContainsKey("McaBank") -or
        $Data.ContainsKey("ApicId") -or
        $Message -match '(?i)Machine Check|Processor Core|Cache Hierarchy|Bus/Interconnect'
    ) {
        return "Processor MCA/MCE"
    }

    if (
        $Data.ContainsKey("PhysicalAddress") -or
        $Data.ContainsKey("PhysicalAddressMask") -or
        (
            ($Data.ContainsKey("Row") -or $Data.ContainsKey("Column") -or $Data.ContainsKey("Module")) -and
            $Message -match '(?i)memory'
        )
    ) {
        return "Memory"
    }

    $raw = Get-DataValue $Data @("RawData") ""

    if (
        $Event.Id -eq 1 -or
        (-not [string]::IsNullOrWhiteSpace($raw) -and (($raw -replace '[^0-9A-Fa-f]', '') -match '^(?i)43504552'))
    ) {
        return "Firmware / CPER"
    }

    return "Other WHEA"
}

function Decode-MciStatus {
    param([string]$Value)

    $result = [ordered]@{
        Valid = $false
        Value = ""
        McaCode = ""
        ExtCode = ""
        Flags = ""
    }

    $v = Convert-ToUInt64Safe $Value

    if ($null -eq $v) {
        return [pscustomobject]$result
    }

    $result.Valid = $true
    $result.Value = ("0x{0:X16}" -f [UInt64]$v)
    $result.McaCode = ("0x{0:X4}" -f ([UInt64]$v -band 0xFFFF))
    $result.ExtCode = ("0x{0:X2}" -f (([UInt64]$v -shr 16) -band 0x3F))

    $flags = New-Object System.Collections.Generic.List[string]

    $flagMap = @(
        @{ Bit = 63; Name = "VAL"   },
        @{ Bit = 62; Name = "OVER"  },
        @{ Bit = 61; Name = "UC"    },
        @{ Bit = 60; Name = "EN"    },
        @{ Bit = 59; Name = "MISCV" },
        @{ Bit = 58; Name = "ADDRV" },
        @{ Bit = 57; Name = "PCC"   }
    )

    foreach ($f in $flagMap) {
        $bitValue = (([UInt64]$v -shr [int]$f.Bit) -band 1)
        $flags.Add(("{0}={1}" -f $f.Name, $bitValue))
    }

    $result.Flags = ($flags -join ", ")
    return [pscustomobject]$result
}

function Get-RawDataInfo {
    param([string]$RawData)

    $ret = [ordered]@{
        HasData = $false
        ByteLength = 0
        Signature = ""
        Summary = ""
    }

    if ([string]::IsNullOrWhiteSpace($RawData)) {
        return [pscustomobject]$ret
    }

    $hex = ($RawData -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()

    if ($hex.Length -lt 2) {
        return [pscustomobject]$ret
    }

    $ret.HasData = $true
    $ret.ByteLength = [int]($hex.Length / 2)

    if ($hex.StartsWith("43504552")) {
        $ret.Signature = "CPER"
        $ret.Summary = "CPER signature detected"
    }
    else {
        $ret.Signature = "RawData"
        $ret.Summary = "WHEA raw data"
    }

    return [pscustomobject]$ret
}

# ============================================================
# Event Analyze
# ============================================================

function Analyze-WheaEvent {
    param($Event)

    $data = Get-EventDataMap $Event
    $message = Get-EventMessageSafe $Event
    $category = Get-WheaCategory -Event $Event -Data $data -Message $message

    # --------------------------------------------------------
    # Common
    # --------------------------------------------------------

    $levelName = ""

    try {
        $levelName = [string]$Event.LevelDisplayName
    }
    catch {
    }

    if ([string]::IsNullOrWhiteSpace($levelName)) {
        $levelName = "Level $($Event.Level)"
    }

    $errorSource = Get-DataValue $data @("ErrorSource") ""
    $errorType = Get-DataValue $data @("ErrorType") ""

    # --------------------------------------------------------
    # PCIe fields
    # --------------------------------------------------------

    $headerLog = Get-DataValue $data @("HeaderLog") ""

    $bus = if ($data.ContainsKey("Bus")) { Convert-ToUInt64Safe $data["Bus"] } else { $null }
    $dev = if ($data.ContainsKey("Device")) { Convert-ToUInt64Safe $data["Device"] } else { $null }
    $fun = if ($data.ContainsKey("Function")) { Convert-ToUInt64Safe $data["Function"] } else { $null }
    $seg = if ($data.ContainsKey("Segment")) { Convert-ToUInt64Safe $data["Segment"] } else { 0 }

    $bdf = "N/A"

    if ($null -ne $bus -and $null -ne $dev -and $null -ne $fun) {
        if ($null -eq $seg) {
            $seg = 0
        }

        $bdf = ("{0:X4}:{1:X2}:{2:X2}.{3:X1}" -f $seg, $bus, $dev, $fun)
    }

    $vendorId = if ($data.ContainsKey("VendorID")) { Format-HexValue $data["VendorID"] 4 } else { "N/A" }
    $deviceId = if ($data.ContainsKey("DeviceID")) { Format-HexValue $data["DeviceID"] 4 } else { "N/A" }

    $primaryDevice = Get-DataValue $data @("PrimaryDeviceName") "N/A"
    $secondaryDevice = Get-DataValue $data @("SecondaryDeviceName") "N/A"

    $ues = if ($data.ContainsKey("UncorrectableErrorStatus")) {
        Format-HexValue $data["UncorrectableErrorStatus"] 8
    }
    else {
        "N/A"
    }

    $ces = if ($data.ContainsKey("CorrectableErrorStatus")) {
        Format-HexValue $data["CorrectableErrorStatus"] 8
    }
    else {
        "N/A"
    }

    $decoded = Decode-PcieHeaderLog $headerLog

    # --------------------------------------------------------
    # Processor MCA/MCE/SMCA fields
    # --------------------------------------------------------

    $apicId = Get-DataValue $data @("ApicId", "APICId", "ProcessorAPICId") ""
    $mcaBank = Get-DataValue $data @("MCABank", "McaBank", "Bank") ""
    $mciStatRaw = Get-DataValue $data @("MciStat", "MciStatus", "MCI_STATUS") ""
    $mciAddrRaw = Get-DataValue $data @("MciAddr", "MCI_ADDR") ""
    $mciMiscRaw = Get-DataValue $data @("MciMisc", "MCI_MISC") ""
    $mci = Decode-MciStatus $mciStatRaw

    # Additional event fields often present in Processor WHEA
    $transactionType = Get-DataValue $data @("TransactionType") ""
    $participation = Get-DataValue $data @("Participation") ""
    $requestType = Get-DataValue $data @("RequestType") ""
    $memoryIO = Get-DataValue $data @("MemorIO", "MemoryIO") ""
    $memHierarchy = Get-DataValue $data @("MemHierarchyLvl", "MemoryHierarchyLevel") ""
    $timeout = Get-DataValue $data @("Timeout") ""
    $operationType = Get-DataValue $data @("OperationType") ""
    $channel = Get-DataValue $data @("Channel") ""

    # --------------------------------------------------------
    # Memory fields
    # --------------------------------------------------------

    $physicalAddress = Get-DataValue $data @("PhysicalAddress") ""
    $physicalAddressMask = Get-DataValue $data @("PhysicalAddressMask") ""
    $node = Get-DataValue $data @("Node") ""
    $card = Get-DataValue $data @("Card") ""
    $module = Get-DataValue $data @("Module") ""
    $memBank = Get-DataValue $data @("Bank") ""
    $memDevice = Get-DataValue $data @("Device") ""
    $rowValue = Get-DataValue $data @("Row") ""
    $columnValue = Get-DataValue $data @("Column") ""
    $bitPosition = Get-DataValue $data @("BitPosition") ""

    # --------------------------------------------------------
    # Firmware / CPER fields
    # --------------------------------------------------------

    $rawData = Get-DataValue $data @("RawData") ""
    $rawInfo = Get-RawDataInfo $rawData
    $rawLengthField = Get-DataValue $data @("Length") ""

    # --------------------------------------------------------
    # Display Location
    # --------------------------------------------------------

    $location = "N/A"

    switch ($category) {
        "PCIe AER" {
            $location = $bdf
        }

        "Processor MCA/MCE" {
            $parts = New-Object System.Collections.Generic.List[string]

            if (-not [string]::IsNullOrWhiteSpace($apicId)) {
                $parts.Add("APIC $apicId")
            }

            if (-not [string]::IsNullOrWhiteSpace($mcaBank)) {
                $parts.Add("Bank $mcaBank")
            }

            if ($parts.Count -gt 0) {
                $location = ($parts -join " / ")
            }
            else {
                $location = "Processor"
            }
        }

        "Memory" {
            if (-not [string]::IsNullOrWhiteSpace($physicalAddress)) {
                $location = "PA $physicalAddress"
            }
            elseif (-not [string]::IsNullOrWhiteSpace($node)) {
                $location = "Node $node"
            }
            else {
                $location = "Memory"
            }
        }

        "Firmware / CPER" {
            $location = if ($rawInfo.Signature -eq "CPER") { "CPER" } else { "Firmware" }
        }

        default {
            $location = "WHEA"
        }
    }

    # --------------------------------------------------------
    # Key Data
    # --------------------------------------------------------

    $keyParts = New-Object System.Collections.Generic.List[string]

    switch ($category) {
        "PCIe AER" {
            if ($ues -ne "N/A") { $keyParts.Add("UES=$ues") }
            if ($ces -ne "N/A") { $keyParts.Add("CES=$ces") }
            if (-not [string]::IsNullOrWhiteSpace($decoded.TlpType) -and $decoded.TlpType -ne "N/A") {
                $keyParts.Add("TLP=$($decoded.TlpType)")
            }
        }

        "Processor MCA/MCE" {
            if ($mci.Valid) {
                $keyParts.Add("MCi_STATUS=$($mci.Value)")
            }

            if (-not [string]::IsNullOrWhiteSpace($errorType)) {
                $keyParts.Add("ErrorType=$errorType")
            }

            if (-not [string]::IsNullOrWhiteSpace($mciAddrRaw)) {
                $keyParts.Add("Addr=$mciAddrRaw")
            }
        }

        "Memory" {
            if (-not [string]::IsNullOrWhiteSpace($physicalAddress)) {
                $keyParts.Add("PA=$physicalAddress")
            }

            if (-not [string]::IsNullOrWhiteSpace($errorType)) {
                $keyParts.Add("ErrorType=$errorType")
            }

            if (-not [string]::IsNullOrWhiteSpace($module)) {
                $keyParts.Add("Module=$module")
            }
        }

        "Firmware / CPER" {
            if ($rawInfo.HasData) {
                $keyParts.Add("$($rawInfo.Signature)=$($rawInfo.ByteLength) bytes")
            }

            if (-not [string]::IsNullOrWhiteSpace($rawLengthField)) {
                $keyParts.Add("Length=$rawLengthField")
            }
        }

        default {
            if (-not [string]::IsNullOrWhiteSpace($errorSource)) {
                $keyParts.Add("ErrorSource=$errorSource")
            }

            if (-not [string]::IsNullOrWhiteSpace($errorType)) {
                $keyParts.Add("ErrorType=$errorType")
            }
        }
    }

    $keyData = if ($keyParts.Count -gt 0) { $keyParts -join "; " } else { "N/A" }

    # --------------------------------------------------------
    # Universal Decode Summary
    # --------------------------------------------------------

    $summary = ""

    if ($category -eq "PCIe AER") {
        $summary = $decoded.Summary
    }
    elseif ($category -eq "Processor MCA/MCE") {
        $parts = New-Object System.Collections.Generic.List[string]

        if ($script:Lang -eq "en-US") {
            $parts.Add("Processor MCA/MCE")
        }
        elseif ($script:Lang -eq "zh-CN") {
            $parts.Add("处理器 MCA/MCE")
        }
        else {
            $parts.Add("處理器 MCA/MCE")
        }

        if (-not [string]::IsNullOrWhiteSpace($apicId)) {
            $parts.Add("APIC=$apicId")
        }

        if (-not [string]::IsNullOrWhiteSpace($mcaBank)) {
            $parts.Add("Bank=$mcaBank")
        }

        if ($mci.Valid) {
            $parts.Add("MCi_STATUS=$($mci.Value)")
            $parts.Add("MCA_CODE=$($mci.McaCode)")
            $parts.Add("ExtCode[21:16]=$($mci.ExtCode)")
            $parts.Add($mci.Flags)
        }

        if (-not [string]::IsNullOrWhiteSpace($errorType)) {
            $parts.Add("ErrorType=$errorType")
        }

        if (-not [string]::IsNullOrWhiteSpace($errorSource)) {
            $parts.Add("ErrorSource=$errorSource")
        }

        if (-not [string]::IsNullOrWhiteSpace($mciAddrRaw)) {
            $parts.Add("MCi_ADDR=$mciAddrRaw")
        }

        if (-not [string]::IsNullOrWhiteSpace($mciMiscRaw)) {
            $parts.Add("MCi_MISC=$mciMiscRaw")
        }

        if ($script:Lang -eq "en-US") {
            $parts.Add("Vendor/model-specific syndrome meanings are kept as raw values.")
        }
        elseif ($script:Lang -eq "zh-CN") {
            $parts.Add("品牌/CPU Family 专属 syndrome 保留原始值，不做无依据推测。")
        }
        else {
            $parts.Add("廠牌/CPU Family 專屬 syndrome 保留原始值，不做無依據推測。")
        }

        $summary = ($parts -join "；")
    }
    elseif ($category -eq "Memory") {
        $parts = New-Object System.Collections.Generic.List[string]

        if ($script:Lang -eq "en-US") {
            $parts.Add("Memory WHEA")
        }
        elseif ($script:Lang -eq "zh-CN") {
            $parts.Add("内存 WHEA")
        }
        else {
            $parts.Add("記憶體 WHEA")
        }

        foreach ($pair in @(
            @("PhysicalAddress", $physicalAddress),
            @("Mask", $physicalAddressMask),
            @("Node", $node),
            @("Card", $card),
            @("Module", $module),
            @("Bank", $memBank),
            @("Device", $memDevice),
            @("Row", $rowValue),
            @("Column", $columnValue),
            @("BitPosition", $bitPosition),
            @("ErrorType", $errorType)
        )) {
            if (-not [string]::IsNullOrWhiteSpace([string]$pair[1])) {
                $parts.Add("$($pair[0])=$($pair[1])")
            }
        }

        $summary = ($parts -join "；")
    }
    elseif ($category -eq "Firmware / CPER") {
        if ($rawInfo.HasData) {
            if ($script:Lang -eq "en-US") {
                $summary = "Firmware/CPER WHEA record; RawData=$($rawInfo.ByteLength) bytes; Signature=$($rawInfo.Signature). The payload is preserved for follow-up platform-specific decoding."
            }
            elseif ($script:Lang -eq "zh-CN") {
                $summary = "Firmware/CPER WHEA 记录；RawData=$($rawInfo.ByteLength) bytes；Signature=$($rawInfo.Signature)。保留原始 payload，供后续平台专属解码。"
            }
            else {
                $summary = "Firmware/CPER WHEA 記錄；RawData=$($rawInfo.ByteLength) bytes；Signature=$($rawInfo.Signature)。保留原始 payload，供後續平台專屬解碼。"
            }
        }
        else {
            $summary = "Firmware / CPER WHEA"
        }
    }
    else {
        $parts = New-Object System.Collections.Generic.List[string]

        if (-not [string]::IsNullOrWhiteSpace($errorSource)) {
            $parts.Add("ErrorSource=$errorSource")
        }

        if (-not [string]::IsNullOrWhiteSpace($errorType)) {
            $parts.Add("ErrorType=$errorType")
        }

        if (-not [string]::IsNullOrWhiteSpace($message)) {
            $parts.Add($message)
        }

        $summary = if ($parts.Count -gt 0) { $parts -join "；" } else { "Other WHEA event" }
    }

    $mciStatDisplay = $mciStatRaw

    if ($mci.Valid) {
        $mciStatDisplay = $mci.Value
    }

    return [pscustomobject]@{
        TimeCreated              = $Event.TimeCreated
        EventId                  = $Event.Id
        EventRecordId            = $Event.RecordId
        LevelName                = $levelName
        Category                 = $category
        Location                 = $location
        KeyData                  = $keyData
        EventMessage             = $message
        ErrorSource              = $errorSource
        ErrorType                = $errorType

        WHEA_BDF                 = $bdf
        VendorID                 = $vendorId
        DeviceID                 = $deviceId
        VIDDID                   = "$vendorId / $deviceId"
        PrimaryDeviceName        = $primaryDevice
        SecondaryDeviceName      = $secondaryDevice
        UncorrectableErrorStatus = $ues
        CorrectableErrorStatus   = $ces
        HeaderLogRaw             = $headerLog
        HeaderLogRawDwords       = $decoded.RawDwords
        HeaderLogDwords          = $decoded.Dwords
        HeaderByteOrder          = $decoded.ByteOrder
        TlpCommand               = $decoded.TlpType
        RequesterID              = $decoded.RequesterRid
        RequesterTraditional     = $decoded.RequesterTraditional
        RequesterARI             = $decoded.RequesterAri
        TargetTraditional        = $decoded.TargetTraditional
        TargetARI                = $decoded.TargetAri
        ConfigOffset             = $decoded.ConfigOffset
        Address                  = $decoded.Address
        CompletionStatus         = $decoded.CompletionStatus
        LengthDW                 = $decoded.LengthDw
        LengthBytes              = $decoded.LengthBytes
        Tag                      = $decoded.Tag
        LBE                      = $decoded.LastBE
        FBE                      = $decoded.FirstBE

        ApicId                   = $apicId
        MCABank                  = $mcaBank
        MciStat                  = $mciStatDisplay
        MciMcaCode               = $mci.McaCode
        MciExtCode               = $mci.ExtCode
        MciFlags                 = $mci.Flags
        MciAddr                  = $mciAddrRaw
        MciMisc                  = $mciMiscRaw
        TransactionType          = $transactionType
        Participation            = $participation
        RequestType              = $requestType
        MemoryIO                 = $memoryIO
        MemHierarchyLvl          = $memHierarchy
        Timeout                  = $timeout
        OperationType            = $operationType
        Channel                  = $channel

        PhysicalAddress          = $physicalAddress
        PhysicalAddressMask      = $physicalAddressMask
        Node                     = $node
        Card                     = $card
        Module                   = $module
        MemoryBank               = $memBank
        MemoryDevice             = $memDevice
        Row                      = $rowValue
        Column                   = $columnValue
        BitPosition              = $bitPosition

        RawData                  = $rawData
        RawDataBytes             = $rawInfo.ByteLength
        RawDataSignature         = $rawInfo.Signature

        DecodeSummary            = $summary
    }
}

function Write-Reports {
    param(
        [System.Collections.IList]$Rows,
        [string]$EvtxPath
    )

    $stamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
    $txtPath = Join-Path $script:ToolDir ("WHEA_Hardware_Report_{0}.txt" -f $stamp)
    $htmlPath = Join-Path $script:ToolDir ("WHEA_Hardware_Report_{0}.html" -f $stamp)

    $counter = 1

    while ((Test-Path -LiteralPath $txtPath) -or (Test-Path -LiteralPath $htmlPath)) {
        $txtPath = Join-Path $script:ToolDir ("WHEA_Hardware_Report_{0}_{1:D2}.txt" -f $stamp, $counter)
        $htmlPath = Join-Path $script:ToolDir ("WHEA_Hardware_Report_{0}_{1:D2}.html" -f $stamp, $counter)
        $counter++
    }

    # ========================================================
    # TXT
    # ========================================================

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("================================================================================")
    $lines.Add("$($script:ProductName) v$($script:ToolVersion)")
    $lines.Add("================================================================================")
    $lines.Add("Source EVTX : $EvtxPath")
    $lines.Add("Generated   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')")
    $lines.Add("WHEA Events : $($Rows.Count)")
    $lines.Add("")

    $i = 0

    foreach ($row in $Rows) {
        $i++

        $lines.Add(("=" * 110))
        $lines.Add(("[{0:D4}] {1}   WHEA Event ID {2}   {3}   Record {4}" -f `
            $i,
            $row.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss.fff"),
            $row.EventId,
            $row.LevelName,
            $row.EventRecordId
        ))
        $lines.Add(("-" * 110))
        $lines.Add(("Category                   : {0}" -f $row.Category))
        $lines.Add(("Location / BDF             : {0}" -f $row.Location))
        $lines.Add(("Key Data                   : {0}" -f $row.KeyData))

        if ($row.Category -eq "PCIe AER") {
            $lines.Add(("WHEA BDF                  : {0}" -f $row.WHEA_BDF))
            $lines.Add(("Vendor / Device           : {0} / {1}" -f $row.VendorID, $row.DeviceID))
            $lines.Add(("PrimaryDeviceName         : {0}" -f $row.PrimaryDeviceName))
            $lines.Add(("Uncorrectable Error Status: {0}" -f $row.UncorrectableErrorStatus))
            $lines.Add(("Correctable Error Status  : {0}" -f $row.CorrectableErrorStatus))
            $lines.Add(("HeaderLog (Raw)           : {0}" -f $(if ([string]::IsNullOrWhiteSpace($row.HeaderLogRaw)) { "N/A" } else { $row.HeaderLogRaw })))

            if (-not [string]::IsNullOrWhiteSpace($row.HeaderLogRaw)) {
                $lines.Add(("TLP DWORDs                : {0}" -f $row.HeaderLogDwords))
                $lines.Add(("TLP Command               : {0}" -f $row.TlpCommand))
                $lines.Add(("Requester                 : {0}" -f $row.RequesterTraditional))
                $lines.Add(("Requester (ARI)           : {0}" -f $row.RequesterARI))
                $lines.Add(("Target                    : {0}" -f $row.TargetTraditional))
                $lines.Add(("Target (ARI)              : {0}" -f $row.TargetARI))
                $lines.Add(("Config Offset             : {0}" -f $row.ConfigOffset))
            }
        }
        elseif ($row.Category -eq "Processor MCA/MCE") {
            $lines.Add(("APIC ID                   : {0}" -f $row.ApicId))
            $lines.Add(("MCA Bank                  : {0}" -f $row.MCABank))
            $lines.Add(("MCi_STATUS                : {0}" -f $row.MciStat))
            $lines.Add(("MCA_CODE                  : {0}" -f $row.MciMcaCode))
            $lines.Add(("ExtCode[21:16]            : {0}" -f $row.MciExtCode))
            $lines.Add(("Common MCA Flags          : {0}" -f $row.MciFlags))
            $lines.Add(("MCi_ADDR                  : {0}" -f $row.MciAddr))
            $lines.Add(("MCi_MISC                  : {0}" -f $row.MciMisc))
            $lines.Add(("ErrorSource / ErrorType   : {0} / {1}" -f $row.ErrorSource, $row.ErrorType))
            $lines.Add(("Transaction / Request     : {0} / {1}" -f $row.TransactionType, $row.RequestType))
            $lines.Add(("Participation / Hierarchy : {0} / {1}" -f $row.Participation, $row.MemHierarchyLvl))
        }
        elseif ($row.Category -eq "Memory") {
            $lines.Add(("PhysicalAddress            : {0}" -f $row.PhysicalAddress))
            $lines.Add(("PhysicalAddressMask        : {0}" -f $row.PhysicalAddressMask))
            $lines.Add(("Node / Card / Module       : {0} / {1} / {2}" -f $row.Node, $row.Card, $row.Module))
            $lines.Add(("Bank / Device              : {0} / {1}" -f $row.MemoryBank, $row.MemoryDevice))
            $lines.Add(("Row / Column / BitPosition : {0} / {1} / {2}" -f $row.Row, $row.Column, $row.BitPosition))
            $lines.Add(("ErrorSource / ErrorType    : {0} / {1}" -f $row.ErrorSource, $row.ErrorType))
        }
        elseif ($row.Category -eq "Firmware / CPER") {
            $lines.Add(("RawData Signature          : {0}" -f $row.RawDataSignature))
            $lines.Add(("RawData Bytes              : {0}" -f $row.RawDataBytes))
            $lines.Add(("RawData                    : {0}" -f $row.RawData))
        }
        else {
            $lines.Add(("ErrorSource / ErrorType    : {0} / {1}" -f $row.ErrorSource, $row.ErrorType))

            if (-not [string]::IsNullOrWhiteSpace($row.EventMessage)) {
                $lines.Add(("Message                    : {0}" -f $row.EventMessage))
            }
        }

        $lines.Add("")
        $lines.Add((">>> 解讀 / Interpretation <<<"))
        $lines.Add($row.DecodeSummary)
        $lines.Add("")
    }

    $lines.Add(("=" * 110))
    $lines.Add($script:CopyrightText)
    $lines.Add(("=" * 110))

    Write-DebugLog "Writing TXT report: $txtPath"
    $lines | Out-File -LiteralPath $txtPath -Encoding UTF8 -ErrorAction Stop

    # ========================================================
    # HTML
    # ========================================================

    Write-DebugLog "Writing HTML report: $htmlPath"

    $html = New-Object System.Text.StringBuilder
    [void]$html.AppendLine("<!DOCTYPE html>")
    [void]$html.AppendLine("<html lang=""zh-Hant""><head><meta charset=""utf-8"">")
    [void]$html.AppendLine("<meta name=""viewport"" content=""width=device-width, initial-scale=1"">")
    [void]$html.AppendLine("<title>WHEA Hardware Report</title>")
    [void]$html.AppendLine("<style>")
    [void]$html.AppendLine("body{font-family:'Segoe UI','Microsoft JhengHei','Microsoft YaHei',Arial,sans-serif;margin:24px;background:#f4f6f8;color:#202428}.page{max-width:1500px;margin:auto}.header,.event{background:#fff;border:1px solid #d8dde3;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.05)}.header{padding:18px 22px;margin-bottom:18px}.title{font-size:26px;font-weight:700}.meta{font-size:13px;color:#5d6772;line-height:1.7;word-break:break-all}.event{margin:16px 0;overflow:hidden}.event-head{background:#eef3f8;padding:11px 16px;font-weight:700;border-bottom:1px solid #d8dde3}.badge{display:inline-block;border-radius:5px;padding:3px 8px;font-weight:700;margin-left:8px;background:#0d6efd;color:#fff}.badge.cpu{background:#6f42c1}.badge.mem{background:#198754}.badge.fw{background:#6c757d}.grid{display:grid;grid-template-columns:230px minmax(0,1fr)}.k,.v{padding:8px 12px;border-bottom:1px solid #edf0f2}.k{font-weight:600;background:#fafbfc;color:#3c4651}.v{font-family:Consolas,'Courier New',monospace;word-break:break-all}.decode{margin:16px;border:3px solid #e0a800;background:#fff3bf;border-radius:8px;padding:14px 16px;box-shadow:0 0 0 3px rgba(224,168,0,.08)}.decode-title{font-size:17px;font-weight:800;color:#7a5200;margin-bottom:7px}.decode-text{font-size:15px;font-weight:700;line-height:1.65;color:#3d2d00;word-break:break-word}.footer{text-align:center;margin:28px 0 8px;color:#59636e;font-size:13px;font-weight:600}@media(max-width:800px){.grid{grid-template-columns:1fr}.k{border-bottom:0}}")
    [void]$html.AppendLine("</style></head><body><div class=""page"">")

    $safeEvtx = Convert-ToHtmlSafe $EvtxPath
    $safeGenerated = Convert-ToHtmlSafe (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff")
    $safeVersion = Convert-ToHtmlSafe $script:ToolVersion

    [void]$html.AppendLine("<div class=""header""><div class=""title"">WHEA Hardware Analyzer <span class=""badge"">v$safeVersion</span></div>")
    [void]$html.AppendLine("<div class=""meta""><b>Source EVTX:</b> $safeEvtx<br><b>Generated:</b> $safeGenerated<br><b>WHEA Events:</b> $($Rows.Count)</div></div>")

    $i = 0

    foreach ($row in $Rows) {
        $i++

        $safeTime = Convert-ToHtmlSafe $row.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss.fff")
        $safeCategory = Convert-ToHtmlSafe $row.Category
        $safeLevel = Convert-ToHtmlSafe $row.LevelName
        $safeLocation = Convert-ToHtmlSafe $row.Location
        $safeKey = Convert-ToHtmlSafe $row.KeyData
        $safeDecode = Convert-ToHtmlSafe $row.DecodeSummary

        $badgeClass = ""

        if ($row.Category -eq "Processor MCA/MCE") { $badgeClass = " cpu" }
        elseif ($row.Category -eq "Memory") { $badgeClass = " mem" }
        elseif ($row.Category -eq "Firmware / CPER") { $badgeClass = " fw" }

        [void]$html.AppendLine("<section class=""event"">")
        [void]$html.AppendLine("<div class=""event-head"">[$("{0:D4}" -f $i)] $safeTime &nbsp; | &nbsp; Event $($row.EventId) &nbsp; | &nbsp; $safeLevel <span class=""badge$badgeClass"">$safeCategory</span></div>")
        [void]$html.AppendLine("<div class=""grid"">")
        [void]$html.AppendLine("<div class=""k"">Location / BDF</div><div class=""v"">$safeLocation</div>")
        [void]$html.AppendLine("<div class=""k"">Key Data</div><div class=""v"">$safeKey</div>")

        if ($row.Category -eq "PCIe AER") {
            [void]$html.AppendLine("<div class=""k"">Vendor / Device</div><div class=""v"">$(Convert-ToHtmlSafe $row.VendorID) / $(Convert-ToHtmlSafe $row.DeviceID)</div>")
            [void]$html.AppendLine("<div class=""k"">PrimaryDeviceName</div><div class=""v"">$(Convert-ToHtmlSafe $row.PrimaryDeviceName)</div>")
            [void]$html.AppendLine("<div class=""k"">UES / CES</div><div class=""v"">$(Convert-ToHtmlSafe $row.UncorrectableErrorStatus) / $(Convert-ToHtmlSafe $row.CorrectableErrorStatus)</div>")
            [void]$html.AppendLine("<div class=""k"">HeaderLog</div><div class=""v"">$(Convert-ToHtmlSafe $row.HeaderLogRaw)</div>")
            [void]$html.AppendLine("<div class=""k"">TLP</div><div class=""v"">$(Convert-ToHtmlSafe $row.TlpCommand)</div>")
            [void]$html.AppendLine("<div class=""k"">Requester</div><div class=""v"">$(Convert-ToHtmlSafe $row.RequesterTraditional) | $(Convert-ToHtmlSafe $row.RequesterARI)</div>")
            [void]$html.AppendLine("<div class=""k"">Target</div><div class=""v"">$(Convert-ToHtmlSafe $row.TargetTraditional) | $(Convert-ToHtmlSafe $row.TargetARI)</div>")
            [void]$html.AppendLine("<div class=""k"">Config Offset</div><div class=""v"">$(Convert-ToHtmlSafe $row.ConfigOffset)</div>")
        }
        elseif ($row.Category -eq "Processor MCA/MCE") {
            [void]$html.AppendLine("<div class=""k"">APIC / MCA Bank</div><div class=""v"">$(Convert-ToHtmlSafe $row.ApicId) / $(Convert-ToHtmlSafe $row.MCABank)</div>")
            [void]$html.AppendLine("<div class=""k"">MCi_STATUS</div><div class=""v"">$(Convert-ToHtmlSafe $row.MciStat)</div>")
            [void]$html.AppendLine("<div class=""k"">MCA_CODE / ExtCode</div><div class=""v"">$(Convert-ToHtmlSafe $row.MciMcaCode) / $(Convert-ToHtmlSafe $row.MciExtCode)</div>")
            [void]$html.AppendLine("<div class=""k"">Common MCA Flags</div><div class=""v"">$(Convert-ToHtmlSafe $row.MciFlags)</div>")
            [void]$html.AppendLine("<div class=""k"">MCi_ADDR / MCi_MISC</div><div class=""v"">$(Convert-ToHtmlSafe $row.MciAddr) / $(Convert-ToHtmlSafe $row.MciMisc)</div>")
            [void]$html.AppendLine("<div class=""k"">ErrorSource / ErrorType</div><div class=""v"">$(Convert-ToHtmlSafe $row.ErrorSource) / $(Convert-ToHtmlSafe $row.ErrorType)</div>")
        }
        elseif ($row.Category -eq "Memory") {
            [void]$html.AppendLine("<div class=""k"">Physical Address</div><div class=""v"">$(Convert-ToHtmlSafe $row.PhysicalAddress)</div>")
            [void]$html.AppendLine("<div class=""k"">Node / Card / Module</div><div class=""v"">$(Convert-ToHtmlSafe $row.Node) / $(Convert-ToHtmlSafe $row.Card) / $(Convert-ToHtmlSafe $row.Module)</div>")
            [void]$html.AppendLine("<div class=""k"">Bank / Device</div><div class=""v"">$(Convert-ToHtmlSafe $row.MemoryBank) / $(Convert-ToHtmlSafe $row.MemoryDevice)</div>")
            [void]$html.AppendLine("<div class=""k"">Row / Column / Bit</div><div class=""v"">$(Convert-ToHtmlSafe $row.Row) / $(Convert-ToHtmlSafe $row.Column) / $(Convert-ToHtmlSafe $row.BitPosition)</div>")
        }
        elseif ($row.Category -eq "Firmware / CPER") {
            [void]$html.AppendLine("<div class=""k"">RawData Signature</div><div class=""v"">$(Convert-ToHtmlSafe $row.RawDataSignature)</div>")
            [void]$html.AppendLine("<div class=""k"">RawData Bytes</div><div class=""v"">$($row.RawDataBytes)</div>")
        }
        else {
            [void]$html.AppendLine("<div class=""k"">ErrorSource / ErrorType</div><div class=""v"">$(Convert-ToHtmlSafe $row.ErrorSource) / $(Convert-ToHtmlSafe $row.ErrorType)</div>")
            [void]$html.AppendLine("<div class=""k"">Message</div><div class=""v"">$(Convert-ToHtmlSafe $row.EventMessage)</div>")
        }

        [void]$html.AppendLine("</div>")
        [void]$html.AppendLine("<div class=""decode""><div class=""decode-title"">★ 解讀 / Interpretation</div><div class=""decode-text"">$safeDecode</div></div>")
        [void]$html.AppendLine("</section>")
    }

    $safeCopyright = Convert-ToHtmlSafe $script:CopyrightText
    [void]$html.AppendLine("<div class=""footer"">$safeCopyright</div></div></body></html>")

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($htmlPath, $html.ToString(), $utf8NoBom)

    if (-not (Test-Path -LiteralPath $txtPath -PathType Leaf)) {
        throw "TXT report creation failed."
    }

    if (-not (Test-Path -LiteralPath $htmlPath -PathType Leaf)) {
        throw "HTML report creation failed."
    }

    Write-DebugLog "Output verification OK. TXT=$txtPath HTML=$htmlPath"

    return [pscustomobject]@{
        Txt = $txtPath
        Html = $htmlPath
    }
}

# ============================================================
# GUI
# ============================================================

$form = New-Object System.Windows.Forms.Form
$form.Text = "$(T 'Title')  v$($script:ToolVersion)"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(1220, 760)
$form.MinimumSize = New-Object System.Drawing.Size(900, 600)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.AutoScroll = $false
# 顯示標準右上角控制：
#   最小化 / 最大化 / 關閉(X)
$form.ControlBox = $true
$form.MaximizeBox = $true
$form.MinimizeBox = $true
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::Sizable

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Dock = [System.Windows.Forms.DockStyle]::Fill
$tabs.Margin = New-Object System.Windows.Forms.Padding(8)

$tabAnalysis = New-Object System.Windows.Forms.TabPage
$tabAnalysis.Text = T "AnalysisTab"

$tabHelp = New-Object System.Windows.Forms.TabPage
$tabHelp.Text = T "HelpTab"

$tabs.TabPages.Add($tabAnalysis)
$tabs.TabPages.Add($tabHelp)

# Input group
$groupInput = New-Object System.Windows.Forms.GroupBox
$groupInput.Text = T "SourceGroup"
$groupInput.Location = New-Object System.Drawing.Point(12, 12)
$groupInput.Size = New-Object System.Drawing.Size(1145, 132)
$groupInput.Anchor = "Top,Left,Right"
$tabAnalysis.Controls.Add($groupInput)

# ------------------------------------------------------------
# 兩列式輸入區：
#
# Row 0:
# System.evtx：[ 路徑輸入框................................ ]
#
# Row 1:
#              [匯入檔案] [開始執行]
#
# 按鈕獨立放在第二列，不再與路徑 TextBox 共用同一列，
# 可避免高 DPI / Windows 顯示縮放時被 TextBox 推出可視範圍。
# ------------------------------------------------------------

$inputLayout = New-Object System.Windows.Forms.TableLayoutPanel
$inputLayout.Dock = [System.Windows.Forms.DockStyle]::Fill
$inputLayout.Padding = New-Object System.Windows.Forms.Padding(10, 10, 10, 8)
$inputLayout.ColumnCount = 2
$inputLayout.RowCount = 2
$inputLayout.GrowStyle = [System.Windows.Forms.TableLayoutPanelGrowStyle]::FixedSize

[void]$inputLayout.ColumnStyles.Add(
    (New-Object System.Windows.Forms.ColumnStyle(
        [System.Windows.Forms.SizeType]::Absolute,
        100
    ))
)

[void]$inputLayout.ColumnStyles.Add(
    (New-Object System.Windows.Forms.ColumnStyle(
        [System.Windows.Forms.SizeType]::Percent,
        100
    ))
)

[void]$inputLayout.RowStyles.Add(
    (New-Object System.Windows.Forms.RowStyle(
        [System.Windows.Forms.SizeType]::Absolute,
        42
    ))
)

[void]$inputLayout.RowStyles.Add(
    (New-Object System.Windows.Forms.RowStyle(
        [System.Windows.Forms.SizeType]::Absolute,
        44
    ))
)

$groupInput.Controls.Add($inputLayout)

# Row 0 / Label
$lblEvtx = New-Object System.Windows.Forms.Label
$lblEvtx.Text = T "EvtxLabel"
$lblEvtx.Dock = [System.Windows.Forms.DockStyle]::Fill
$lblEvtx.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$lblEvtx.Margin = New-Object System.Windows.Forms.Padding(3, 3, 6, 3)
$inputLayout.Controls.Add($lblEvtx, 0, 0)

# Row 0 / Path
$txtEvtx = New-Object System.Windows.Forms.TextBox
$txtEvtx.Dock = [System.Windows.Forms.DockStyle]::Fill
$txtEvtx.Margin = New-Object System.Windows.Forms.Padding(3, 8, 6, 4)
$inputLayout.Controls.Add($txtEvtx, 1, 0)

# Row 1 / Buttons
$buttonPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$buttonPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
$buttonPanel.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$buttonPanel.WrapContents = $false
$buttonPanel.AutoScroll = $false
$buttonPanel.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 0)
$buttonPanel.Padding = New-Object System.Windows.Forms.Padding(3, 3, 0, 0)
$inputLayout.Controls.Add($buttonPanel, 1, 1)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = T "Browse"
$btnBrowse.Size = New-Object System.Drawing.Size(120, 32)
$btnBrowse.Margin = New-Object System.Windows.Forms.Padding(0, 2, 8, 2)
$buttonPanel.Controls.Add($btnBrowse)

$btnAnalyze = New-Object System.Windows.Forms.Button
$btnAnalyze.Text = T "Analyze"
$btnAnalyze.Size = New-Object System.Drawing.Size(130, 32)
$btnAnalyze.Margin = New-Object System.Windows.Forms.Padding(0, 2, 8, 2)
$buttonPanel.Controls.Add($btnAnalyze)

# Status/progress
$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(15, 155)
$progress.Size = New-Object System.Drawing.Size(935, 24)
$progress.Anchor = "Top,Left,Right"
$progress.Minimum = 0
$progress.Maximum = 100
$progress.Value = 0
$tabAnalysis.Controls.Add($progress)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = New-Object System.Drawing.Point(960, 159)
$lblStatus.Size = New-Object System.Drawing.Size(195, 22)
$lblStatus.Anchor = "Top,Right"
$lblStatus.TextAlign = "MiddleRight"
$lblStatus.Text = T "StatusReady"
$tabAnalysis.Controls.Add($lblStatus)

# Summary
$groupSummary = New-Object System.Windows.Forms.GroupBox
$groupSummary.Text = T "SummaryGroup"
$groupSummary.Location = New-Object System.Drawing.Point(12, 190)
$groupSummary.Size = New-Object System.Drawing.Size(1145, 78)
$groupSummary.Anchor = "Top,Left,Right"
$tabAnalysis.Controls.Add($groupSummary)

$lblFoundCaption = New-Object System.Windows.Forms.Label
$lblFoundCaption.Text = (T "Found") + ":"
$lblFoundCaption.Location = New-Object System.Drawing.Point(15, 32)
$lblFoundCaption.AutoSize = $true
$groupSummary.Controls.Add($lblFoundCaption)

$lblFound = New-Object System.Windows.Forms.Label
$lblFound.Text = "0"
$lblFound.Location = New-Object System.Drawing.Point(125, 32)
$lblFound.AutoSize = $true
$groupSummary.Controls.Add($lblFound)

$lblHeaderCaption = New-Object System.Windows.Forms.Label
$lblHeaderCaption.Text = (T "WithHeader") + ":"
$lblHeaderCaption.Location = New-Object System.Drawing.Point(200, 32)
$lblHeaderCaption.AutoSize = $true
$groupSummary.Controls.Add($lblHeaderCaption)

$lblHeader = New-Object System.Windows.Forms.Label
$lblHeader.Text = "0"
$lblHeader.Location = New-Object System.Drawing.Point(325, 32)
$lblHeader.AutoSize = $true
$groupSummary.Controls.Add($lblHeader)

$lblOutputCaption = New-Object System.Windows.Forms.Label
$lblOutputCaption.Text = (T "Output") + ":"
$lblOutputCaption.Location = New-Object System.Drawing.Point(400, 32)
$lblOutputCaption.AutoSize = $true
$groupSummary.Controls.Add($lblOutputCaption)

$txtOutput = New-Object System.Windows.Forms.TextBox
$txtOutput.Location = New-Object System.Drawing.Point(470, 28)
$txtOutput.Size = New-Object System.Drawing.Size(655, 25)
$txtOutput.Anchor = "Top,Left,Right"
$txtOutput.ReadOnly = $true
$groupSummary.Controls.Add($txtOutput)

# Grid
$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(12, 280)
$grid.Size = New-Object System.Drawing.Size(1145, 330)
$grid.Anchor = "Top,Bottom,Left,Right"
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.AllowUserToOrderColumns = $true
$grid.SelectionMode = "FullRowSelect"
$grid.MultiSelect = $false

# 固定欄寬，不使用 Fill 自動縮放，讓內容超過視窗寬度時
# 一定出現水平捲動軸，使用者可左右拖曳查看完整「解讀」內容。
$grid.AutoSizeColumnsMode = [System.Windows.Forms.DataGridViewAutoSizeColumnsMode]::None
$grid.AutoSizeRowsMode = [System.Windows.Forms.DataGridViewAutoSizeRowsMode]::None
$grid.ScrollBars = [System.Windows.Forms.ScrollBars]::Both
$grid.RowHeadersVisible = $false
$grid.AutoGenerateColumns = $false

# 解讀內容維持單行顯示，避免自動換行把列高度撐大。
$grid.DefaultCellStyle.WrapMode = [System.Windows.Forms.DataGridViewTriState]::False

$tabAnalysis.Controls.Add($grid)

function Add-GridColumn {
    param(
        [string]$Name,
        [string]$Header,
        [int]$Width,
        [string]$PropertyName,
        [string]$AutoSizeMode = "None"
    )

    $col = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $col.Name = $Name
    $col.HeaderText = $Header
    $col.DataPropertyName = $PropertyName
    $col.Width = $Width

    if ($AutoSizeMode -ne "None") {
        $col.AutoSizeMode = $AutoSizeMode
    }

    [void]$grid.Columns.Add($col)
}

Add-GridColumn "Time" (T "GridTime") 150 "TimeText"
Add-GridColumn "Event" (T "GridEvent") 65 "EventId"
Add-GridColumn "Type" (T "GridType") 150 "Category"
Add-GridColumn "Location" (T "GridLocation") 170 "Location"
Add-GridColumn "VIDDID" (T "GridVIDDID") 125 "VIDDID"
Add-GridColumn "KeyData" (T "GridKeyData") 360 "KeyData"
Add-GridColumn "Header" (T "GridHeader") 330 "HeaderLogRaw"
Add-GridColumn "Cmd" (T "GridCmd") 85 "TlpCommand"
Add-GridColumn "Target" (T "GridTarget") 170 "TargetDisplay"
Add-GridColumn "Decode" (T "GridDecode") 800 "DecodeSummary"

# Help
$helpBox = New-Object System.Windows.Forms.TextBox
$helpBox.Multiline = $true
$helpBox.ReadOnly = $true
$helpBox.ScrollBars = "Vertical"
$helpBox.WordWrap = $true
$helpBox.Location = New-Object System.Drawing.Point(15, 15)
$helpBox.Size = New-Object System.Drawing.Size(1135, 590)
$helpBox.Anchor = "Top,Bottom,Left,Right"
$helpBox.Text = T "HelpText"
$tabHelp.Controls.Add($helpBox)

# Footer + exit
# 使用 Dock=Bottom 固定在視窗底部，避免低解析度 / DPI 縮放時「離開」按鈕跑出畫面。

$footerPanel = New-Object System.Windows.Forms.TableLayoutPanel
$footerPanel.Dock = [System.Windows.Forms.DockStyle]::Bottom
$footerPanel.Height = 48
$footerPanel.Padding = New-Object System.Windows.Forms.Padding(10, 6, 10, 6)
$footerPanel.ColumnCount = 2
$footerPanel.RowCount = 1

[void]$footerPanel.ColumnStyles.Add(
    (New-Object System.Windows.Forms.ColumnStyle(
        [System.Windows.Forms.SizeType]::Percent,
        100
    ))
)

[void]$footerPanel.ColumnStyles.Add(
    (New-Object System.Windows.Forms.ColumnStyle(
        [System.Windows.Forms.SizeType]::Absolute,
        130
    ))
)

$form.Controls.Add($footerPanel)

# 主內容填滿扣除 footer 後的剩餘區域。
$form.Controls.Add($tabs)

$lblCopyright = New-Object System.Windows.Forms.Label
$lblCopyright.Text = "$($script:CopyrightText)    v$($script:ToolVersion)"
$lblCopyright.Dock = [System.Windows.Forms.DockStyle]::Fill
$lblCopyright.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$footerPanel.Controls.Add($lblCopyright, 0, 0)

$btnExit = New-Object System.Windows.Forms.Button
$btnExit.Text = T "Exit"
$btnExit.Dock = [System.Windows.Forms.DockStyle]::Fill
$btnExit.Margin = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)
$footerPanel.Controls.Add($btnExit, 1, 0)

$openDialog = New-Object System.Windows.Forms.OpenFileDialog
$openDialog.Filter = "Windows Event Log (*.evtx)|*.evtx|All files (*.*)|*.*"
$openDialog.Title = T "SelectEvtx"
$openDialog.Multiselect = $false

function Set-RunningState {
    param([bool]$Running)

    $script:Running = $Running

    $btnBrowse.Enabled = -not $Running
    $btnAnalyze.Enabled = -not $Running
    $btnExit.Enabled = -not $Running
    $txtEvtx.Enabled = -not $Running
    $tabs.TabPages[1].Enabled = -not $Running

    if ($Running) {
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    }
    else {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
    }
}

function Update-Progress {
    param(
        [int]$Percent,
        [string]$Status
    )

    if ($Percent -lt 0) {
        $Percent = 0
    }

    if ($Percent -gt 100) {
        $Percent = 100
    }

    $progress.Value = $Percent
    $lblStatus.Text = $Status

    [System.Windows.Forms.Application]::DoEvents()
}

$btnBrowse.Add_Click({
    try {
        if ($openDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $txtEvtx.Text = $openDialog.FileName
        }
    }
    catch {
        Write-DebugLog "Browse failed: $($_.Exception.Message)" "ERROR"
    }
})

$btnExit.Add_Click({
    if ($script:Running) {
        return
    }

    $script:AllowClose = $true
    $form.Close()
})

$form.Add_FormClosing({
    param($sender, $e)

    # 執行中禁止透過右上角 X / Alt+F4 中止，
    # 避免報告輸出到一半造成資料不完整。
    if ($script:Running) {
        $e.Cancel = $true
        return
    }

    # 非執行狀態下允許使用右上角 X 正常離開。
    $script:AllowClose = $true
})

$btnAnalyze.Add_Click({
    if ($script:Running) {
        return
    }

    $evtxPath = $txtEvtx.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($evtxPath) -or -not (Test-Path -LiteralPath $evtxPath -PathType Leaf)) {
        [System.Windows.Forms.MessageBox]::Show(
            (T "NeedFile"),
            (T "ErrorTitle"),
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null

        return
    }

    try {
        Set-RunningState $true

        $grid.DataSource = $null
        $grid.Rows.Clear()
        $lblFound.Text = "0"
        $lblHeader.Text = "0"
        $txtOutput.Text = ""
        Update-Progress 2 (T "StatusLoading")

        Write-DebugLog "Analysis start. EVTX=$evtxPath"

        # 讀取 WHEA Error / Warning；Event 17 常為 Warning，Event 18 / Event 1 常為 Error。
        $xpath = "*[System[Provider[@Name='Microsoft-Windows-WHEA-Logger'] and (Level=1 or Level=2 or Level=3)]]"

        $events = @(
            Get-WinEvent -Path $evtxPath -FilterXPath $xpath -Oldest -ErrorAction Stop
        )

        $lblFound.Text = [string]$events.Count

        Write-DebugLog "WHEA event count=$($events.Count)"

        $rows = New-Object System.Collections.ArrayList
        $withHeader = 0

        if ($events.Count -eq 0) {
            Update-Progress 80 (T "StatusWriting")
        }
        else {
            for ($i = 0; $i -lt $events.Count; $i++) {
                $evt = $events[$i]

                try {
                    $row = Analyze-WheaEvent $evt
                    [void]$rows.Add($row)

                    if (-not [string]::IsNullOrWhiteSpace($row.HeaderLogRaw)) {
                        $withHeader++
                    }

                    Write-DebugLog (
                        "EventRecordID={0} EventID={1} Category={2} Location={3} HeaderLog={4} TLP={5}" -f `
                        $row.EventRecordId,
                        $row.EventId,
                        $row.Category,
                        $row.Location,
                        $row.HeaderLogRaw,
                        $row.TlpCommand
                    )
                }
                catch {
                    Write-DebugLog "Failed EventRecordID=$($evt.RecordId): $($_.Exception.Message)" "ERROR"
                }

                $percent = 5 + [int](75.0 * (($i + 1) / [Math]::Max(1, $events.Count)))
                Update-Progress $percent ("$(T 'StatusAnalyzing') $($i + 1)/$($events.Count)")
            }
        }

        $lblHeader.Text = [string]$withHeader
        Update-Progress 85 (T "StatusWriting")

        $outputs = Write-Reports -Rows $rows -EvtxPath $evtxPath

        $viewRows = New-Object System.Collections.ArrayList

        foreach ($r in $rows) {
            $targetDisplay = $r.TargetTraditional

            if ([string]::IsNullOrWhiteSpace($targetDisplay)) {
                if (-not [string]::IsNullOrWhiteSpace($r.Address)) {
                    $targetDisplay = $r.Address
                }
                else {
                    $targetDisplay = "N/A"
                }
            }

            [void]$viewRows.Add([pscustomobject]@{
                TimeText      = $r.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
                EventId       = $r.EventId
                Category      = $r.Category
                Location      = $r.Location
                VIDDID        = $r.VIDDID
                KeyData       = $r.KeyData
                HeaderLogRaw  = $r.HeaderLogRaw
                TlpCommand    = $r.TlpCommand
                TargetDisplay = $targetDisplay
                DecodeSummary = $r.DecodeSummary
            })
        }

        $grid.DataSource = $viewRows

        $txtOutput.Text = "$($outputs.Txt) ; $($outputs.Html)"

        Update-Progress 100 (T "StatusDone")
        Write-DebugLog "Analysis completed successfully."

        [System.Windows.Forms.MessageBox]::Show(
            "$(T 'DoneMessage')`r`n`r`nTXT: $($outputs.Txt)`r`nHTML: $($outputs.Html)",
            (T "DoneTitle"),
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
    }
    catch {
        Update-Progress $progress.Value (T "StatusFailed")
        Write-DebugLog "Analysis failed: $($_.Exception.ToString())" "ERROR"

        [System.Windows.Forms.MessageBox]::Show(
            "$((T 'ErrorTitle')): $($_.Exception.Message)",
            (T "ErrorTitle"),
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    finally {
        Set-RunningState $false
    }
})

# ============================================================
# Start GUI
# ============================================================

try {
    Write-DebugLog "GUI shown. Language=$($script:Lang)"
    [void]$form.ShowDialog()
}
catch {
    Write-DebugLog "Fatal GUI exception: $($_.Exception.ToString())" "ERROR"

    try {
        [System.Windows.Forms.MessageBox]::Show(
            "$((T 'ErrorTitle')): $($_.Exception.Message)",
            (T "ErrorTitle"),
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    catch {
    }
}
finally {
    Write-DebugLog "Application exit."
    [Environment]::Exit(0)
}
