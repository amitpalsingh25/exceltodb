const fs = require('fs');
const path = require('path');
const { rcedit } = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const productFilename = context.packager?.appInfo?.productFilename || 'KCS Excel to DB';
  const exeName = `${productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const projectDir = context.packager?.projectDir || process.cwd();
  const iconPath = path.resolve(projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    throw new Error(`afterPack: EXE not found at ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`afterPack: icon not found at ${iconPath}`);
  }

  await rcedit(exePath, {
    icon: iconPath,
  });

  console.log(`afterPack: icon applied to ${exePath}`);
};
