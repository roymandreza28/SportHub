Write-Host "Starting SportHub (3 windows will open: API, Reverb, Website)..."

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\api'; php artisan serve"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\api'; php artisan reverb:start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\web'; npm run dev"

Write-Host "Done. Wait a few seconds, then open this in your browser:"
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop everything later, just close the 3 new windows that opened."
