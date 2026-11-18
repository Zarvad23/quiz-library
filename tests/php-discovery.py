"""Pure Windows-path cases plus a real child-PHP invocation with a custom INI."""
from pathlib import Path
import tempfile,shutil,subprocess
SRC=Path(__file__).resolve().parents[1];work=Path(tempfile.mkdtemp(prefix='pereplet-php-discovery-'));root=work/'site'
(root/'server').mkdir(parents=True);(root/'data').mkdir()
for f in ['bootstrap.php','updater.php']:shutil.copy2(SRC/'server'/f,root/'server'/f)
subprocess.run(['php',str(SRC/'tests/php-discovery.php'),str(root)],check=True)
ini=work/'INI with spaces'/'php.ini';ini.parent.mkdir();ini.write_text('memory_limit=117M\ndisplay_errors=1\n')
subprocess.run(['php','-c',str(ini),str(SRC/'tests/php-discovery.php'),str(root),'custom-ini'],check=True)
