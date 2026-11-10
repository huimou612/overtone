import os, subprocess
env = dict(os.environ)
env.pop('ELECTRON_RUN_AS_NODE', None)
exe = os.path.expandvars(r'%LOCALAPPDATA%\Programs\overtone\overtone.exe')
subprocess.run(['taskkill','/F','/IM','overtone.exe','/T'], capture_output=True)
import time; time.sleep(2)
subprocess.Popen([exe], cwd=os.path.dirname(exe), env=env, creationflags=0x00000008 | 0x00000200)
print('overtone 已正常启动')
