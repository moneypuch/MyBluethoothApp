const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Definisci le dimensioni per ogni densità
const sizes = {
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192
};

// Percorso del logo sorgente
const sourceLogo = path.join(__dirname, 'assets', 'images', 'smartlogo2.png');

// Genera le icone per ogni densità
async function generateIcons() {
  for (const [density, size] of Object.entries(sizes)) {
    const basePath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
    
    try {
      // Genera icona quadrata principale con padding (80% della dimensione)
      const iconSize = Math.floor(size * 0.7);
      await sharp(sourceLogo)
        .resize(iconSize, iconSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: Math.floor((size - iconSize) / 2),
          bottom: Math.ceil((size - iconSize) / 2),
          left: Math.floor((size - iconSize) / 2),
          right: Math.ceil((size - iconSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 90 })
        .toFile(path.join(basePath, 'ic_launcher.webp'));
      
      // Genera icona rotonda con padding
      await sharp(sourceLogo)
        .resize(iconSize, iconSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: Math.floor((size - iconSize) / 2),
          bottom: Math.ceil((size - iconSize) / 2),
          left: Math.floor((size - iconSize) / 2),
          right: Math.ceil((size - iconSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 90 })
        .toFile(path.join(basePath, 'ic_launcher_round.webp'));
      
      // Genera foreground per adaptive icon con padding
      await sharp(sourceLogo)
        .resize(iconSize, iconSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: Math.floor((size - iconSize) / 2),
          bottom: Math.ceil((size - iconSize) / 2),
          left: Math.floor((size - iconSize) / 2),
          right: Math.ceil((size - iconSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 90 })
        .toFile(path.join(basePath, 'ic_launcher_foreground.webp'));
      
      // Genera background bianco per adaptive icon
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .webp({ quality: 90 })
      .toFile(path.join(basePath, 'ic_launcher_background.webp'));
      
      console.log(`✅ Generated all icons for ${density}: ${size}x${size}`);
    } catch (error) {
      console.error(`❌ Error generating ${density}:`, error);
    }
  }
  
  // Aggiorna anche le immagini in assets/images per Expo
  try {
    // Icon principale con padding
    const mainIconSize = Math.floor(1024 * 0.7);
    await sharp(sourceLogo)
      .resize(mainIconSize, mainIconSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: Math.floor((1024 - mainIconSize) / 2),
        bottom: Math.ceil((1024 - mainIconSize) / 2),
        left: Math.floor((1024 - mainIconSize) / 2),
        right: Math.ceil((1024 - mainIconSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, 'assets', 'images', 'app-icon-all.png'));
    
    // Icon Android legacy con padding
    const legacyIconSize = Math.floor(512 * 0.7);
    await sharp(sourceLogo)
      .resize(legacyIconSize, legacyIconSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: Math.floor((512 - legacyIconSize) / 2),
        bottom: Math.ceil((512 - legacyIconSize) / 2),
        left: Math.floor((512 - legacyIconSize) / 2),
        right: Math.ceil((512 - legacyIconSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, 'assets', 'images', 'app-icon-android-legacy.png'));
    
    // Adaptive foreground con padding
    await sharp(sourceLogo)
      .resize(mainIconSize, mainIconSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: Math.floor((1024 - mainIconSize) / 2),
        bottom: Math.ceil((1024 - mainIconSize) / 2),
        left: Math.floor((1024 - mainIconSize) / 2),
        right: Math.ceil((1024 - mainIconSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, 'assets', 'images', 'app-icon-android-adaptive-foreground.png'));
    
    // Adaptive background (bianco)
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .png()
    .toFile(path.join(__dirname, 'assets', 'images', 'app-icon-android-adaptive-background.png'));
    
    // iOS icon con padding
    await sharp(sourceLogo)
      .resize(mainIconSize, mainIconSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: Math.floor((1024 - mainIconSize) / 2),
        bottom: Math.ceil((1024 - mainIconSize) / 2),
        left: Math.floor((1024 - mainIconSize) / 2),
        right: Math.ceil((1024 - mainIconSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, 'assets', 'images', 'app-icon-ios.png'));
    
    console.log('✅ Updated Expo assets icons');
  } catch (error) {
    console.error('❌ Error updating Expo assets:', error);
  }
}

generateIcons().then(() => {
  console.log('🎉 All icons generated and updated successfully!');
}).catch(console.error);