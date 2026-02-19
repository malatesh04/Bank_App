$body = '{"username":"Malatesh","phone":"7676115923","password":"Malatesh@1","confirmPassword":"Malatesh@1"}'
try {
    $r = Invoke-RestMethod -Uri "https://bank-app-sandy-pi.vercel.app/api/register" -Method POST -ContentType "application/json" -Body $body
    $r | ConvertTo-Json -Depth 5
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    $msg = $_.ErrorDetails.Message
    Write-Host "HTTP $code"
    Write-Host $msg
}
