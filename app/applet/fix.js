const fs = require('fs');
let content = fs.readFileSync('src/Admin.tsx', 'utf8');

let navStart = content.indexOf('<nav className="flex-grow space-y-1.5 px-3">');
let navEnd = content.indexOf('</nav>', navStart);
let navContent = content.substring(navStart, navEnd);

navContent = navContent.replace(/<button onClick=\{[\s\S]*?<span className=\{cn\("text-sm", location\.pathname === '([^']+)'/g, 
  (match, path) => {
     let innerStart = match.indexOf('>') + 1;
     let innerEnd = match.lastIndexOf('<span');
     let inner = match.substring(innerStart, innerEnd);
     return `<button onClick={() => { setIsMobileMenuOpen(false); navigate('${path}'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '${path}' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>${inner}<span className={cn("text-sm", location.pathname === '${path}'`;
  }
);

content = content.substring(0, navStart) + navContent + content.substring(navEnd);
fs.writeFileSync('src/Admin.tsx', content);
console.log('Fixed');
