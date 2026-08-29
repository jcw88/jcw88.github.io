import os, subprocess
root = r"D:\codex\c2-sans-fight-master"
python = r"C:\Program Files\Python313\python.exe"
log = os.path.join(root, "server_8765.log")
with open(log, "ab", buffering=0) as f:
    subprocess.Popen(
        [python, "-m", "http.server", "8765", "--bind", "0.0.0.0"],
        cwd=root,
        stdout=f,
        stderr=f,
        stdin=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
    )
