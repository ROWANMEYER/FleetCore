Get-ChildItem convex -Recurse -Include *.ts | 
ForEach-Object { 
  "===== FILE: $($_.FullName.Replace((Get-Location).Path + '\','')) =====" 
  Get-Content $_.FullName 
} > backend_snapshot.txt