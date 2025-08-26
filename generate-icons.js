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
    const outputPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`, 'ic_launcher.webp');
    const outputPathRound = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`, 'ic_launcher_round.webp');
    
    try {
      // Genera icona quadrata
      await sharp(sourceLogo)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 90 })
        .toFile(outputPath);
      
      // Genera icona rotonda (con maschera circolare)
      const roundedCorners = Buffer.from(
        `<svg><circle cx="${size/2}" cy="${size/2}" r="${size/2}"/></svg>`
      );
      
      await sharp(sourceLogo)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .composite([{
          input: roundedCorners,
          blend: 'dest-in'
        }])
        .webp({ quality: 90 })
        .toFile(outputPathRound);
      
      console.log(`✅ Generated ${density}: ${size}x${size}`);
    } catch (error) {
      console.error(`❌ Error generating ${density}:`, error);
    }
  }
  
  // Genera anche le icone background e foreground per adaptive icon
  try {
    await sharp(sourceLogo)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .webp({ quality: 90 })
      .toFile(path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_foreground.webp'));
    
    // Crea un background bianco
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .webp({ quality: 90 })
    .toFile(path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_background.webp'));
    
    console.log('✅ Generated adaptive icon components');
  } catch (error) {
    console.error('❌ Error generating adaptive icons:', error);
  }
}

generateIcons().then(() => {
  console.log('🎉 All icons generated successfully!');
}).catch(console.error);