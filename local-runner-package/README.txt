AutoTest Local Runner for Windows

First use:
1. Extract this ZIP file to a local folder.
2. Double-click install-and-start.bat.
3. Keep the minimized "AutoTest Local Runner" window running.
4. Refresh http://172.16.18.100:5173/cases. The page will show that the local runner is connected.

Later use:
- Double-click start-runner.bat before executing cases.
- Double-click stop-runner.bat to stop the runner.

Browser:
- The runner first uses Chrome installed on this computer.
- If Chrome is unavailable, it tries Microsoft Edge.

Security:
- The service only listens on 127.0.0.1:3210 and is not exposed to the LAN.
- By default it only accepts requests from http://172.16.18.100:5173.
