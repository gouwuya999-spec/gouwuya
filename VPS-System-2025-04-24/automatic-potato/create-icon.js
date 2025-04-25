const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

async function createIcon() {
  try {
    console.log('开始创建图标...');
    
    // 创建一个简单的SVG图标
    const svgIcon = `
      <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="256" height="256" rx="50" fill="#2196F3"/>
        <rect x="68" y="68" width="120" height="80" rx="10" fill="white"/>
        <rect x="78" y="84" width="100" height="16" rx="3" fill="#444"/>
        <rect x="78" y="116" width="100" height="16" rx="3" fill="#444"/>
        <text x="128" y="180" font-family="Arial" font-size="40" font-weight="bold" fill="white" text-anchor="middle">WG</text>
        <line x1="60" y1="200" x2="200" y2="120" stroke="rgba(255,255,255,0.7)" stroke-width="5"/>
      </svg>
    `;
    
    // 创建PNG图标
    await sharp(Buffer.from(svgIcon))
      .resize(256, 256)
      .png()
      .toFile('icon.png');
    
    console.log('PNG图标已创建');
    
    // 读取PNG图片
    const pngBuffer = fs.readFileSync('icon.png');
    
    // 创建所需的尺寸数组
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const resizedBuffers = await Promise.all(
      sizes.map(size => 
        sharp(pngBuffer)
          .resize(size, size)
          .toBuffer()
      )
    );
    
    // 转换为ICO
    const icoBuffer = await toIco(resizedBuffers);
    
    // 保存ICO文件
    fs.writeFileSync('icon.ico', icoBuffer);
    
    console.log('图标已保存为icon.ico');
  } catch (error) {
    console.error('创建图标失败:', error);
  }
}

// 执行
createIcon(); 