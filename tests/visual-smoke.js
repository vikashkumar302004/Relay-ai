const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

async function capture(window, name) {
  let image;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    image = await window.webContents.capturePage();
    if (!image.isEmpty()) break;
    window.webContents.invalidate();
  }
  const outputDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(outputDir, { recursive: true });
  if (!image || image.isEmpty()) throw new Error(`Empty visual capture: ${name}`);
  fs.writeFileSync(path.join(outputDir, name), image.toPNG());
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 420, height: 680, show: true, skipTaskbar: true, frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.on('console-message', (_event, level, message) => console.log(`[renderer:${level}] ${message}`));
  window.webContents.on('did-fail-load', (_event, code, description) => console.error(`load failed ${code}: ${description}`));
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await window.webContents.executeJavaScript("localStorage.removeItem('relay-onboarded-v1')");
  await window.reload();
  console.log(await window.webContents.executeJavaScript("document.body.innerText.slice(0, 500)"));
  await capture(window, 'onboarding.png');
  await window.webContents.executeJavaScript("localStorage.setItem('relay-onboarded-v1','1')");
  await window.reload();
  await window.webContents.executeJavaScript("document.querySelector('.web-handoff-cta').click()");
  await new Promise(resolve => setTimeout(resolve, 250));
  const handoffVisible = await window.webContents.executeJavaScript("Boolean(document.querySelector('.web-drawer'))");
  if (!handoffVisible) throw new Error('Free web handoff did not open');
  console.log(await window.webContents.executeJavaScript("JSON.stringify({text:document.querySelector('.web-drawer').innerText.slice(0,100),z:getComputedStyle(document.querySelector('.web-overlay')).zIndex,display:getComputedStyle(document.querySelector('.web-overlay')).display})"));
  window.webContents.invalidate();
  await capture(window, 'free-web-handoff.png');
  await window.reload();
  await capture(window, 'sessions.png');
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
