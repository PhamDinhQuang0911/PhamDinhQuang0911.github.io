const fs = require('fs');

const files = [
    'dashboard.html',
    'dashboard-mapid.html',
    'exam-editor.html',
    'exam.html',
    'practice.html',
    'course-manager.html',
    'book-manager.html',
    'topic-builder.html'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let html = fs.readFileSync(file, 'utf8');

    // Replace font URL
    html = html.replace('family=Nunito:wght@400;600;700;800;900', 'family=Inter:wght@400;500;600;700;800;900');
    html = html.replace('family=Nunito:wght@400;600;700;800', 'family=Inter:wght@400;500;600;700;800;900');
    html = html.replace(/font-family:\s*'Nunito'/g, "font-family: 'Inter'");
    html = html.replace(/Nunito/g, 'Inter');

    // Replace hardcoded colors with primary/season system
    // The previous design heavily used blue for teacher dashboard instead of teal.
    // Wait, dashboard.html uses `bg-blue-600` and `text-blue-600` heavily. 
    // If we want it to follow the season theme, we should change `blue-` to `primary-`.
    // But `blue-` is used for many things. Let's be careful.
    // In dashboard.html, let's just do a blanket replace of `text-blue-` -> `text-primary-`, `bg-blue-` -> `bg-primary-`, `border-blue-` -> `border-primary-`, `ring-blue-` -> `ring-primary-`.
    
    html = html.replace(/bg-blue-/g, 'bg-primary-');
    html = html.replace(/text-blue-/g, 'text-primary-');
    html = html.replace(/border-blue-/g, 'border-primary-');
    html = html.replace(/ring-blue-/g, 'ring-primary-');
    html = html.replace(/shadow-blue-/g, 'shadow-primary-');

    // Also change `text-[#13796A]` (brand text) to `text-primary-700`
    html = html.replace(/text-\[\#13796A\]/g, 'text-primary-700');

    fs.writeFileSync(file, html, 'utf8');
    console.log(`${file} updated successfully.`);
});
