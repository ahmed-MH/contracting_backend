const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) { 
            walkDir(dirPath, callback);
        } else if (dirPath.endsWith('.ts')) {
            callback(dirPath);
        }
    });
}

const srcDir = path.join(__dirname, 'src');

walkDir(srcDir, function(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    if (content.includes('AuthenticatedRequest')) {
        let relPath = path.relative(path.dirname(filePath), path.join(__dirname, 'src', 'common', 'interfaces', 'request.interface'));
        relPath = relPath.replace(/\\/g, '/');
        if (!relPath.startsWith('.')) relPath = './' + relPath;
        relPath = relPath.replace('.ts', '');

        if (!content.includes(relPath) && !content.includes(`from '../interfaces/request.interface'`)) {
            // we need to insert the import
            content = `import { AuthenticatedRequest } from '${relPath}';\n` + content;
        }
    }

    if (filePath.endsWith('.spec.ts')) {
        content = content.replace(/,\s*tenantId:\s*1/g, '');
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated fix in ${filePath}`);
    }
});
