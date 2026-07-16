const extractBracesAfterCommand = (text, command, numBraces) => {
    let result = { found: false, contents: [], startIndex: -1, endIndex: -1 };
    let cmdIdx = text.indexOf(command);
    if (cmdIdx === -1) return result;

    result.startIndex = cmdIdx;
    result.found = true;
    let currentIdx = cmdIdx + command.length;

    for (let count = 0; count < numBraces; count++) {
        while (currentIdx < text.length && (text[currentIdx] === ' ' || text[currentIdx] === '\n' || text[currentIdx] === '\t' || text[currentIdx] === '\r' || text[currentIdx] === '%')) {
            if(text[currentIdx] === '%') {
                while(currentIdx < text.length && text[currentIdx] !== '\n') currentIdx++;
            } else {
                currentIdx++;
            }
        }
        
        if (text[currentIdx] !== '{') {
            if (count === 0 && text[currentIdx] === '[') {
                while(currentIdx < text.length && text[currentIdx] !== ']') currentIdx++;
                currentIdx++;
                while (currentIdx < text.length && (text[currentIdx] === ' ' || text[currentIdx] === '\n' || text[currentIdx] === '\t' || text[currentIdx] === '\r' || text[currentIdx] === '%')) {
                    if(text[currentIdx] === '%') {
                        while(currentIdx < text.length && text[currentIdx] !== '\n') currentIdx++;
                    } else {
                        currentIdx++;
                    }
                }
            }
            if (text[currentIdx] !== '{') break;
        }
        
        let braceCount = 0;
        let inBrace = false;
        let contentStart = currentIdx + 1;
        let contentEnd = -1;
        
        for (let i = currentIdx; i < text.length; i++) {
            if (text[i] === '{') {
                braceCount++;
                inBrace = true;
            } else if (text[i] === '}') {
                braceCount--;
            }
            
            if (inBrace && braceCount === 0) {
                contentEnd = i;
                break;
            }
        }
        
        if (contentEnd !== -1) {
            result.contents.push(text.substring(contentStart, contentEnd));
            currentIdx = contentEnd + 1;
            result.endIndex = currentIdx;
        } else {
            break;
        }
    }
    return result;
};

const latex = String.raw\\\immini{
	\\begin{note}
	Trong đo đạc, khi người quan sát có hướng nhìn ngang theo tia $ (Hình bên) thì
	\\begin{itemize}
	\\item Góc $\\widehat{xOA}$ gọi là góc nghiêng lên hay góc nâng;
	\\item Góc $\\widehat{xOB}$ gọi là góc nghiêng xuống hay góc hạ.
	\\end{itemize}
	\\end{note}
	}
	{
	\\begin{tikzpicture}[scale=0.5]
	\\def\\r{4}
	\\path 	(0,0) coordinate (O)
	(35:\\r) coordinate (A) node[xshift=6mm,rotate=-30]{\\twemoji[scale=.8]{airplane}}
	(-20:\\r) coordinate (B) node[xshift=6mm]{\\twemoji[scale=.8]{boat}}
	(0:\\r) coordinate (x);
	\\draw 	(A)--(O)--(B);
	\\draw [dashed] (O)--(x);
	\\foreach \\x/\\g in {A/90,B/-90,O/180,x/60} \\fill[blue] (\\x) circle (0pt)(+(\\x)$) node {$\\x$};	
	\\draw pic[draw,angle radius=6mm,thick]{angle=x--O--A};
	\\draw pic[draw,double,angle radius=8mm,thick]{angle=B--O--x};
	\\end{tikzpicture}
	}\;

console.log(extractBracesAfterCommand(latex, '\\\\immini', 2).contents.length);
