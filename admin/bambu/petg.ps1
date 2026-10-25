param([string]$base,[string]$fil,[string]$out)
$dir='C:\Program Files\Bambu Studio\resources\profiles\BBL\filament'
function Flat([string]$name){
  $p=Join-Path $dir ($name+'.json'); $o=Get-Content -Raw -Encoding UTF8 $p | ConvertFrom-Json
  $h=@{}; if($o.inherits){ $h=Flat $o.inherits }
  foreach($pr in $o.PSObject.Properties){ $h[$pr.Name]=$pr.Value }
  return $h }
$f=Flat $fil
$cfg=Get-Content -Raw -Encoding UTF8 $base | ConvertFrom-Json
$skip=@('type','name','inherits','from','setting_id','instantiation','description','filament_id','compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition')
$n=0; $miss=@()
foreach($k in $f.Keys){ if($skip -contains $k){ continue }
  if($cfg.PSObject.Properties.Name -contains $k){ $cfg.$k=$f[$k]; $n++ } else { $miss+=$k } }
$cfg.filament_settings_id=@($fil)
if($f['filament_id']){ $cfg.filament_ids=@($f['filament_id']) }
$json=$cfg | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($out,$json,(New-Object System.Text.UTF8Encoding($false)))
"$out : $n claves; sin usar: $($miss -join ', ')"
