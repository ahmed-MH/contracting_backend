const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function findFiles(dir, filter, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const fileStat = fs.lstatSync(filePath);

    if (fileStat.isDirectory()) {
      findFiles(filePath, filter, fileList);
    } else if (filter.test(filePath)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

const entityFiles = findFiles(srcDir, /\.entity\.ts$/);

let mermaidDiagram = 'classDiagram\n';

entityFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  
  // Basic heuristic: find "export class <ClassName>"
  const classMatch = content.match(/export class\s+(\w+)/);
  if (!classMatch) return;
  const className = classMatch[1];
  
  mermaidDiagram += `  class ${className} {\n`;
  
  // Find properties: "  propName: type;"
  const propRegex = /^\s+([a-zA-Z0-9_]+)\s*:\s*([^;]+);/gm;
  let propMatch;
  while ((propMatch = propRegex.exec(content)) !== null) {
      // Basic type extraction
      let propName = propMatch[1];
      let propType = propMatch[2].trim();
      mermaidDiagram += `    +${propType} ${propName}\n`;
  }
  mermaidDiagram += `  }\n`;

  // Find relations: Look for things like "@OneToMany(() => Target,"
  // Actually, look for decorators and their target types.
  // OneToMany, ManyToOne, ManyToMany, OneToOne
  const relationRegex = /@(OneToMany|ManyToOne|ManyToMany|OneToOne)\s*\(\s*\(\)\s*=>\s*([a-zA-Z0-9_]+)(?:[^]*?)\s+([a-zA-Z0-9_]+)\s*:/gm;
  let relMatch;
  while ((relMatch = relationRegex.exec(content)) !== null) {
      const relType = relMatch[1];
      const targetEntity = relMatch[2];
      const propName = relMatch[3];
      
      let arrowStr = '';
      if (relType === 'OneToMany') arrowStr = '"1" --> "*"';
      else if (relType === 'ManyToOne') arrowStr = '"*" --> "1"';
      else if (relType === 'ManyToMany') arrowStr = '"*" -- "*"';
      else if (relType === 'OneToOne') arrowStr = '"1" -- "1"';

      mermaidDiagram += `  ${className} ${arrowStr} ${targetEntity} : ${propName}\n`;
  }
});

fs.writeFileSync(path.join(__dirname, 'tmp_uml.txt'), mermaidDiagram);
console.log('Diagram generated in tmp_uml.txt');
