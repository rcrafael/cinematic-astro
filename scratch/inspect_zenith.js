fetch('https://www.zenith-astro.com/assets/index-Cfj8GuKd.js')
  .then(r => r.text())
  .then(t => {
    const vids = t.match(/https?:\/\/[^"'\s]+\.(mp4|webm)/ig) || [];
    console.log('Videos:', vids);
    const textSnippets = t.match(/"hero_desc":"[^"]+"/ig) || [];
    console.log('Descriptions:', textSnippets);
    const cinematicKeys = t.match(/"[^"]*flyby[^"]*"/ig) || [];
    console.log('Flyby keys:', cinematicKeys);
    // Find video tags or player code
    const playerCode = t.match(/<video[^>]+>/ig) || [];
    console.log('Video tags:', playerCode);
  });
