/* Kickpact Watch Party — Electron main.
 *
 * Pears-stack desktop app: the UI is an Electron renderer, and the P2P layer
 * (Hyperswarm room) runs in a Bare worker spawned via pear-runtime. IPC is a
 * framed byte stream (framed-stream) relayed to the renderer — the same
 * pattern as holepunchto/hello-pear-electron.
 */
const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const PearRuntime = require("pear-runtime")
const FramedStream = require("framed-stream")

const pkg = require("../package.json")

const protocol = "kickpact-watchparty"
const workers = new Map()

ipcMain.on("pkg", (evt) => {
  evt.returnValue = pkg
})

function sendToAll(name, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(name, data)
  }
}

/** Spawn (or reuse) a Bare worker and relay its framed IPC to the renderer. */
function getWorker(specifier) {
  if (workers.has(specifier)) return workers.get(specifier)

  const worker = PearRuntime.run(require.resolve(".." + specifier), [])
  const pipe = new FramedStream(worker)

  const sendStdout = (data) => sendToAll("pear:worker:stdout:" + specifier, data)
  const sendStderr = (data) => sendToAll("pear:worker:stderr:" + specifier, data)
  const sendIPC = (data) => sendToAll("pear:worker:ipc:" + specifier, data)
  const onBeforeQuit = () => pipe.destroy()

  ipcMain.handle("pear:worker:writeIPC:" + specifier, (evt, data) => {
    return pipe.write(data)
  })

  workers.set(specifier, pipe)
  pipe.on("data", sendIPC)
  worker.stdout.on("data", sendStdout)
  worker.stderr.on("data", sendStderr)
  worker.once("exit", (code) => {
    app.removeListener("before-quit", onBeforeQuit)
    ipcMain.removeHandler("pear:worker:writeIPC:" + specifier)
    pipe.removeListener("data", sendIPC)
    worker.stdout.removeListener("data", sendStdout)
    worker.stderr.removeListener("data", sendStderr)
    sendToAll("pear:worker:exit:" + specifier, code)
    workers.delete(specifier)
  })
  app.on("before-quit", onBeforeQuit)
  return pipe
}

ipcMain.handle("pear:startWorker", (evt, filename) => {
  getWorker(filename)
  return true
})

async function createWindow() {
  const win = new BrowserWindow({
    width: 470,
    height: 840,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: "#10162e",
    title: "Kickpact Watch Party",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"))
}

app.setAsDefaultProtocolClient(protocol)

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    createWindow().catch((err) => {
      console.error("Failed to create window:", err)
      app.quit()
    })
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((err) => console.error("Failed to create window:", err))
      }
    })
  })
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
}
