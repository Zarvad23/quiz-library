<?php
// This file only runs through tests/php-discovery.py on a disposable installation.
require $argv[1] . '/server/bootstrap.php';
require $argv[1] . '/server/updater.php';
function check(bool $condition, string $message): void {if(!$condition)throw new RuntimeException($message);}
$windows = ['ini'=>'C:\\xampp\\php\\php.ini','binary'=>'C:\\xampp\\apache\\bin\\httpd.exe','bindir'=>'C:\\build\\php','root'=>'C:\\xampp\\htdocs\\quiz-library','extension_dir'=>'C:\\xampp\\php\\ext','sapi'=>'apache2handler','version'=>'8.2','windows'=>true];
$choose = function(array $runtime, array $existing): string {return up_choose_php(up_php_candidates($runtime),fn($p)=>in_array($p,$existing,true));};
check($choose($windows,['C:/xampp/php/php.exe'])==='C:/xampp/php/php.exe','XAMPP under Apache was not found');
$custom = array_replace($windows,['ini'=>'D:\\Library Tools\\xampp\\php\\php.ini','root'=>'E:\\Sites\\Quiz','binary'=>'D:\\Library Tools\\xampp\\apache\\bin\\httpd.exe','extension_dir'=>'ext']);
check($choose($custom,['D:/Library Tools/xampp/php/php.exe','C:/build/php/php.exe'])==='D:/Library Tools/xampp/php/php.exe','Loaded INI must outrank build paths and support spaces/custom drives');
$noIni=array_replace($custom,['ini'=>'']);
check($choose($noIni,['D:/Library Tools/xampp/php/php.exe'])==='D:/Library Tools/xampp/php/php.exe','Apache sibling PHP directory fallback failed');
$noApache=array_replace($windows,['ini'=>'','binary'=>'C:/web/httpd.exe','extension_dir'=>'ext','bindir'=>'C:/build']);
check($choose($noApache,['C:/xampp/php/php.exe'])==='C:/xampp/php/php.exe','Site ancestor fallback failed');
$cli=['ini'=>'/etc/php/8.5/cli/php.ini','binary'=>'/usr/bin/php8.5','bindir'=>'/usr/bin','root'=>'/srv/site','extension_dir'=>'/usr/lib/php/20250925','sapi'=>'cli','version'=>'8.5','windows'=>false];
check($choose($cli,['/usr/bin/php8.5','/usr/bin/php'])==='/usr/bin/php8.5','CLI binary must retain its exact version');
try {up_choose_php(['C:/xampp/apache/bin/httpd.exe'],fn($p)=>true);throw new LogicException('httpd.exe accepted as PHP');}catch(RuntimeException $expected){}
$dir=up_dir();
up_write_json($dir.'/check.json',['checked'=>time(),'error'=>'Включите extension=curl','environment'=>'old-environment']);
check(up_cached_check()===[],'Stale environment cache was reused');
up_write_json($dir.'/check.json',['checked'=>time(),'error'=>'Включите extension=curl']);
check(up_cached_check()===[],'Legacy cache must be invalidated');
up_write_json($dir.'/check.json',['checked'=>time(),'error'=>'Current network error','environment'=>up_environment()]);
check(up_cached_check()['error']==='Current network error','A current error must remain visible');
if(isset($argv[2])&&$argv[2]==='custom-ini') {
    check(ini_get('memory_limit')==='117M','Parent did not load custom INI');
    up_run(['-r','if(ini_get("memory_limit")!=="117M")exit(1);']);
}
echo "PASS: Windows XAMPP runtime INI, custom drive/spaces, Apache sibling and site ancestor fallbacks, exact CLI version, no httpd execution, stale extension cache invalidation, child INI.\n";
