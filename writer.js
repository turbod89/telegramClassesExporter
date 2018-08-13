const TelegramClass = function (name,desc,members) {
    this.name = name;
    this.desc = desc;
    this.members = members;

    this.members.sort( (a,b) => {
        if (a.optional && !b.optional) {
            return 1;
        } else if (!a.optional && b.optional) {
            return -1;
        } else {
            return 0;
        }
    })

    this.getFilename = function () {
        return this.name + '.ts';
    }

    this.getImportFilename = function () {
        return this.getFilename().replace(/.ts$/g,'');
    }

}

const Writer = function () {
    
    const classes = [];

    const getClassIndex = function (name) {
        return classes.findIndex( c => c.name === name);
    }

    this.existsClass = function (name) {
        return classes.some (c => c.name === name)
    }

    this.getClass = function (name) {
        const i = getClassIndex(name);
        return i < 0 ? null : classes[i];
    }

    this.addClass = function (name,desc,members) {
        const c = new TelegramClass(name,desc,members);
        const ci = getClassIndex(name);
        
        if (ci < 0) {
            classes.push(c)
        } else {
            classes[ci] = c;
        }

        return this;
    }

    this.getClassDependecies = function (name) {
        const dep = [];
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        
        if ( c !== null) {
            c.members.forEach( member => {
                
                const classIndex = classes.findIndex( cc => {
                    const r = new RegExp('^'+cc.name+'((\\[\\])+)*$','g');
                    return r.test(member.type);
                });

                const isClass = classIndex >= 0;
                if (isClass) {
                    const cc = classes[classIndex];
                    const isAlready = (cc.name === c.name) || dep.some(c => cc.name === c.name)
                    if (!isAlready) {
                        dep.push(cc)
                    }
                }
            })
        }

        return dep;
    }

    this.forEachClass = function (callback) {
        classes.forEach( c => callback(c,this));
        return this;
    }


    const writeClassDependecies = (c) => {
        const dep = this.getClassDependecies(c);
        return dep.reduce( (code,c) => code + `import { ${c.name} } from './${c.getImportFilename()}';\n`,'');
    }

    const writeClassConstructor = (name) => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    constructor (`;
        c.members.forEach(member => {
            code += `
        ${member.name}: ${member.type}`;
            if (member.optional) {
                code += ' = null';
            }
            code+=',';
        })

        code += `
    ) {}
`;
        return code;
    }

    const writeClassMemberDeclarations = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=``;
        c.members.forEach(member => {
            code += `
    /* ${member.desc.length < 120 ? member.desc : member.desc.substr(0,117)+'...'} */
    private ${member.name}: ${member.type}`;
            if (member.optional) {
                code += ' = null';
            }
            code+=';\n';
        })

        code += ``;
        return code;
    }

    const writeClassGetters = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=``;

        c.members.forEach(member => {
            code += `
    public get_${member.name}() {
        return this.${member.name};
    }
`;
        })

        code += ``;
        return code;
    }
    
    const writeClassSetters = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=``;

        c.members.forEach(member => {
            code += `
    public set_${member.name}(${member.name}: ${member.type}) {
        this.${member.name} = ${member.name};
        return this;
    }
`;
        })

        code += ``;
        return code;
    }

    const writeClassToArray = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    public toArray () {
        return {`;

        c.members.forEach(member => {
            code += `
            '${member.name}': this.get_${member.name}(),`;
        })

        code += `
        };
    }
`;
        return code;
    }

    const writeClassFromArray = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    public static fromJson (json) {
        return new ${c.name}(`;

        c.members.forEach(member => {
            code += `
            json['${member.name}'] ? json['${member.name}'] : null,`;
        })

        code += `
        );
    }
`;
        return code;
    }


    this.writeClass = function (name) {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code += writeClassDependecies(c);
        code += '\n';
        code += `

export class ${c.name} {

    /* members */

${writeClassMemberDeclarations(c)}

    /* fromJson */
${writeClassFromArray(c)}

    /* Constructor */
${writeClassConstructor(c)}

    /* Getters*/
${writeClassGetters(c)}

    /* Setters*/
${writeClassSetters(c)}

    /* toArray */
${writeClassToArray(c)}
}
`

        return code;
    }

    Object.defineProperties(this,{
        'length': {
            'configurable': false,
            'enumerable': true,
            'get': () => classes.length,
        },
    });
}

module.exports = Writer;