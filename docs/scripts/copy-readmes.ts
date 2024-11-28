import fs from 'fs'
import path from 'path'

const readmes = [
  {
    source: 'packages/msw-testing/README.md', // relative to gitroot
    destination: 'src/content/docs/testing/msw-testing.md', // relative to gitroot/docs
  },
  {
    source: 'README.md', // relative to gitroot
    destination: 'src/content/docs/guides/usage.md', // relative to gitroot/docs
  },
  // Add more paths as needed
]

const gitRoot = path.resolve('../')

const cwd = process.cwd()

readmes.forEach(({ source, destination }) => {
  const sourcePath = path.join(gitRoot, source)
  const destinationPath = path.join(cwd, destination)

  fs.copyFileSync(sourcePath, destinationPath)
  console.log(`Copied ${sourcePath} to ${destinationPath}`)
})
