const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Definisci le dimensioni per ogni densità drawable
const sizes = {
  'mdpi': 200,
  'hdpi': 300,
  'xhdpi': 400,
  'xxhdpi': 600,
  'xxxhdpi': 800
};

// Percorso del logo sorgente - usiamo smartlogo2.png
const sourceLogo = path.join(__dirname, 'assets', 'images', 'smartlogo2.png');

// Genera i loghi splash per ogni densità
async function generateSplashLogos() {
  for (const [density, size] of Object.entries(sizes)) {
    const outputPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', `drawable-${density}`, 'splashscreen_logo.png');
    
    try {
      // Genera logo per splash screen con padding (70% della dimensione)
      const logoSize = Math.floor(size * 0.7);
      await sharp(sourceLogo)
        .resize(logoSize, logoSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: Math.floor((size - logoSize) / 2),
          bottom: Math.ceil((size - logoSize) / 2),
          left: Math.floor((size - logoSize) / 2),
          right: Math.ceil((size - logoSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated splash logo for ${density}: ${size}x${size}`);
    } catch (error) {
      console.error(`❌ Error generating ${density}:`, error);
    }
  }
  
  // Non aggiorniamo splash-screen.png perché già aggiornato dall'utente
  console.log('ℹ️ Skipping splash-screen.png update (already updated by user)');
}

generateSplashLogos().then(() => {
  console.log('🎉 All splash logos generated successfully!');
}).catch(console.error);