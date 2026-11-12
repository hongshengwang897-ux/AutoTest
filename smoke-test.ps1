$ErrorActionPreference = "Stop"

# 冒烟测试：验证前后端核心链路（平台已移除登录认证，所有接口开放访问）

Write-Output "=== 1. Backend Health ==="
$h = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -UseBasicParsing
Write-Output "$($h.StatusCode) $($h.Content)"

Write-Output ""
Write-Output "=== 2. Frontend ==="
$f = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing
Write-Output "$($f.StatusCode)"

Write-Output ""
Write-Output "=== 3. GET /api/stats ==="
$s = Invoke-WebRequest -Uri 'http://localhost:3001/api/stats' -UseBasicParsing
Write-Output "$($s.StatusCode) length=$($s.Content.Length)"

Write-Output ""
Write-Output "=== 4. GET /api/cases ==="
$c = Invoke-WebRequest -Uri 'http://localhost:3001/api/cases' -UseBasicParsing
Write-Output "$($c.StatusCode) length=$($c.Content.Length)"

Write-Output ""
Write-Output "=== 5. GET /api/executions (paged) ==="
$e = Invoke-WebRequest -Uri 'http://localhost:3001/api/executions?page=1&limit=5' -UseBasicParsing
Write-Output "$($e.StatusCode) $($e.Content.Substring(0, [Math]::Min(120, $e.Content.Length)))..."

Write-Output ""
Write-Output "=== 6. GET /api/docs/openapi.json ==="
$api = Invoke-WebRequest -Uri 'http://localhost:3001/api/docs/openapi.json' -UseBasicParsing
Write-Output "$($api.StatusCode) length=$($api.Content.Length)"

Write-Output ""
Write-Output "=== ALL TESTS PASSED ==="
