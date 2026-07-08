module.exports = {
  packagerConfig: {
    name: "Kickpact Watch Party",
    executableName: "kickpact-watchparty",
    appBundleId: "io.kickpact.watchparty",
    asar: false, // pear-runtime spawns Bare workers from real paths
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "win32", "linux"] },
    { name: "@electron-forge/maker-dmg", platforms: ["darwin"] },
  ],
}
