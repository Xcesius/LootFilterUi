const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs/promises')

// Disable GPU acceleration if issues occur
app.disableHardwareAcceleration()

// Handle Squirrel events for Windows installer
if (require('electron-squirrel-startup')) app.quit()

interface ElectronWindow extends Electron.BrowserWindow {}
let mainWindow: ElectronWindow | null = null
let forceQuit = false
let exitTimeout: NodeJS.Timeout | null = null

// Force quit the app after a timeout
function forceQuitApp() {
  console.log('Force quitting app...')
  if (mainWindow) {
    mainWindow.destroy()
  }
  app.exit(0)
}

function createWindow() {
  console.log('Creating main window')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // Handle loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
    if (process.env.NODE_ENV === 'development') {
      console.log('Retrying development server connection...')
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:3000')
      }, 1000)
    }
  })

  if (process.env.NODE_ENV === 'development') {
    console.log('Loading development URL')
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    console.log('Loading production URL')
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle window close event
  mainWindow.on('close', (event: Electron.Event) => {
    console.log('Window close event triggered')
    console.log('forceQuit:', forceQuit)
    
    if (!forceQuit) {
      event.preventDefault()
      console.log('Sending app-closing event to renderer')
      mainWindow?.webContents.send('app-closing')
      
      // Force quit after 1 second if renderer doesn't respond
      exitTimeout = setTimeout(() => {
        console.log('Exit timeout reached, forcing quit')
        forceQuitApp()
      }, 1000)
    }
  })

  mainWindow.on('closed', () => {
    console.log('Window closed event triggered')
    mainWindow = null
  })
}

// Handle force quit from renderer
ipcMain.handle('force-quit', () => {
  console.log('Force quit requested from renderer')
  if (exitTimeout) {
    clearTimeout(exitTimeout)
    exitTimeout = null
  }
  forceQuit = true
  process.nextTick(() => {
    forceQuitApp()
  })
  return Promise.resolve()
})

app.on('ready', () => {
  console.log('App ready')
  createWindow()
})

app.on('window-all-closed', () => {
  console.log('All windows closed')
  forceQuitApp()
})

app.on('activate', () => {
  console.log('App activated')
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', () => {
  console.log('Before quit event triggered')
  if (exitTimeout) {
    clearTimeout(exitTimeout)
    exitTimeout = null
  }
  forceQuit = true
})

// File system operations
ipcMain.handle('readFile', async (_, path) => {
  console.log(`Reading file: ${path}`)
  try {
    const data = await fs.readFile(path, 'utf-8')
    return data
  } catch (error) {
    console.error(`Failed to read file: ${path}`, error)
    throw error
  }
})

ipcMain.handle('writeFile', async (_, path, data) => {
  console.log(`Writing file: ${path}`)
  try {
    await fs.writeFile(path, data, 'utf-8')
  } catch (error) {
    console.error(`Failed to write file: ${path}`, error)
    throw error
  }
})

ipcMain.handle('readDir', async (_, path) => {
  console.log(`Reading directory: ${path}`)
  try {
    const files = await fs.readdir(path)
    return files
  } catch (error) {
    console.error(`Failed to read directory: ${path}`, error)
    throw error
  }
}) 