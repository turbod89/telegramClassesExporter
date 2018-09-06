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
        return this.name + '.js';
    }

    this.getImportFilename = function () {
        return this.getFilename().replace(/.js$/g,'');
    }

}

const lowerCamelCase = function (name) {
    let index = name.search(/_[a-z]/g);
    while (index >= 0) {
        name = name.substr(0, index) + name[index + 1].toUpperCase() + name.substr(index + 2, name.length);
        index = name.search(/_[a-z]/g);
    }

    return name;
}

const upperCamelCase = function (name) {
    name = lowerCamelCase(name);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

const snakeCase = function (name) {
    const text = lowerCamelCase(name);
    const result = text.replace(/([A-Z])/g, "_$1");
    const finalResult = result.toLowerCase();
    return finalResult;
}

const parseCase = function (name) {
    return snakeCase(name);
    // return lowerCamelCase(name);
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

    this.parseType = type => {

        if (/ or /g.test(type)) {
            return this.parseType(type.replace(/^(.+) or .+$/g, '$1'));
        } else if (/^<a href="#[^"]+">(.+)<\/a>/g.test(type)) {
            return this.parseType(type.replace(/^<a href="#[^"]+">(.+)<\/a>/g, '$1'))
        } else if (type === 'True') {
            return 'boolean';
        } else if (type === 'Boolean') {
            return 'boolean';
        } else if (type === 'String') {
            return 'string';
        } else if (type === 'CallbackGame') {
            return 'any';
        } else if (type === 'InputFile') {
            return 'any';
        } else if (type === 'InputMessageContent') {
            return 'any';
        } else if (type === 'Integer') {
            return 'number';
        } else if (type === 'Float' || type === 'Float number') {
            return 'number';
        } else if (/^Array of/g.test(type)) {
            return this.parseType(type.replace(/^Array of (.+)$/g, '$1[]'));
        } else {
            return type.trim();
        }
    }

    const isMemberTypeAClass = memberType => {
        const classIndex = classes.findIndex( cc => {
            const r = new RegExp('^'+cc.name+'((\\[\\])+)*$','g');
            return r.test(memberType);
        });
        return classIndex >= 0;
    }

    const getMemberTypeClass = memberType => {
        const classIndex = classes.findIndex( cc => {
            const r = new RegExp('^'+cc.name+'((\\[\\])+)*$','g');
            return r.test(memberType);
        });
        return classIndex >= 0 ? classes[classIndex] : null;
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
        return dep.reduce((code, c) => code + `const ${c.name} = require('./${c.getImportFilename()}');\n`, '');
    }


    const writeClassMemberDeclarations = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=``;
        c.members.forEach(member => {
            code += `
    let ${parseCase(member.name)} = `;

            if (!isMemberTypeAClass(member.type)) {
                code += `data['${member.name}'] ? data['${member.name}'] : null`;
            } else {
                const mc = getMemberTypeClass(member.type);
                const recMapWriter = function (memberType, varName) {
                    if (/\[\]$/g.test(memberType)) {
                        return varName + '.map( element => ' +
                            recMapWriter(memberType.replace(/\[\]$/g, ''), 'element') +
                            ' )';
                    } else {
                        return 'new ' + mc.name + '(' + varName + ')';
                    }
                }
                const varName = `data['${member.name}']`;
                code += `data['${member.name}'] ? ${recMapWriter(member.type,varName)} : null`;
            }

            code +=';';
            code += ` /* ${member.desc.length < 120 ? member.desc : member.desc.substr(0,117)+'...'} */`;
        })

        return code;
    }

    const writeClassGettersAndSetters = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    Object.defineProperties(this, {
`;

        c.members.forEach(member => {
            code += `
        "${parseCase(member.name)}": {
            enumerable: true,
            modificable: false,
            set: function (value) {
                ${parseCase(member.name)} = value;
            },
            get: function () {
                return ${parseCase(member.name)};
            },
        },
`;
        })

        code += `
    });
`;
        return code;
    }

    const writeClassToArray = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    Object.defineProperties(this, {
        'toArray': {
            enumerable: false,
            modificable: false,
            value: function (deep = -1) {

                if (deep === 0) {
                    return {};
                }

                return {`;

        c.members.forEach(member => {
            if (!isMemberTypeAClass(member.type)) {
                code += `
                    '${member.name}': this.${parseCase(member.name)},`;
                
            } else {
                const mc = getMemberTypeClass(member.type);
                const recMapWriter = function (memberType,varName) {
                    if (/\[\]$/g.test(memberType)) {
                        return varName + '.map( element => '
                        + recMapWriter(memberType.replace(/^(.+)\[\]$/g,'$1'),'element')
                        + ' )';
                    } else {
                        return varName + '.toArray(deep - 1)';
                    }
                }
                const varName = `this.${parseCase(member.name)}`;
                code += `
                    '${member.name}': ${recMapWriter(member.type,varName)},`;
            }
        })

        code += `
                };
            },
        },
    });
`;
        return code;
    }

    this.writeClass = function (name) {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code += writeClassDependecies(c);
        code += '\n';
        code += `
module.exports = function ${c.name}(data) {

    /* Class members */
${writeClassMemberDeclarations(c)}

    /* Getters and Setters*/
${writeClassGettersAndSetters(c)}

    /* toArray */
${writeClassToArray(c)}
}
`

        return code.trim() + '\n';
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