const fs = require('fs');

if (fs.existsSync('output-book.json')) {
    const data = JSON.parse(fs.readFileSync('output-book.json', 'utf8'));
    const tl = data.exercises_TL || [];
    let found = false;
    tl.forEach((q, i) => {
        if (q.content && q.content.includes('<img')) {
            const matches = q.content.match(/<img[^>]+src="([^"]+)"/g);
            console.log('TL', i, matches);
            found = true;
        }
    });
    if (!found) console.log("No images found in exercises_TL of output-book.json");
} else {
    console.log('output-book.json not found');
}
