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

    this.getIdentifierMember = function () {
        return members[0];
    }

    this.getTablename = function () {
        return name.toLowerCase();
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

const parseType = function (type) {
    return
        type === ''
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
            return 'BOOLEAN';
        } else if (type === 'Boolean') {
            return 'BOOLEAN';
        } else if (type === 'String') {
            return 'STRING';
        } else if (type === 'CallbackGame') {
            return null;
        } else if (type === 'InputFile') {
            return null;
        } else if (type === 'InputMessageContent') {
            return null;
        } else if (type === 'Integer') {
            return 'INTEGER';
        } else if (type === 'Float' || type === 'Float number') {
            return 'DECIMAL';
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

    const writeFromArray = name => {
                let code = 'function fromJson (data) {\n';
                const c = (name instanceof TelegramClass) ? name : this.getClass(name);

                c.members.forEach(member => {

                    if (!isMemberTypeAClass(member.type)) {
                    
                    } else {
                        if (/\[\]$/g.test(member.type)) {} else {

                            const c2 = this.getClass(member.type);

                            code += `
    if (data["${parseCase(member.name)}"]) {
       data["${parseCase(member.name)}"] = ${c2.name}.fromJson(data["${parseCase(member.name)}"]).${c2.getIdentifierMember().name};
    }`;
                        }
                    }

                });

                code += `

    return ${c.name}.build(data);
};
`;
                return code;
    }

    const writeBelongsTo = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);

        code += `
    ${c.name}.associate = function (models) {`;
        c.members.forEach(member => {

            if (!isMemberTypeAClass(member.type)) {} else {
                if (/\[\]$/g.test(member.type)) {} else {
                    
                    const c2 = this.getClass(member.type);

                    code += `
        ${c.name}.belongsTo(models.${c2.getTablename()},{as: '${parseCase(member.name)}'});`;
                }
            }

        });
code += `
    }`;
        return code;

    };

    const writeTableFieldDescriptors = name => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);

        c.members.forEach (member => {

            if (!isMemberTypeAClass(member.type) && member.type !== null) {
                if (/\[\]$/g.test(member.type)) {

                } else {
                    code += `
        "${parseCase(member.name)}": {
            type: DataTypes.${member.type},
            allowNull: ${ member.optional ? 'true' : 'false'},`;
                    if (c.getIdentifierMember() === member) {
                        code += `
            primaryKey: true,`;
                }
                    code += `
        },`;
                }
            } else {
                if (/\[\]$/g.test(member.type)) {
                } else {
/*
                    const c2 = this.getClass(member.type);

                    code += `
    "${parseCase(member.name)}": {
        type: DataTypes.INTEGER,
        allowNull: ${ member.optional ? 'true' : 'false'},
        references: {
            model: ${member.type},
            key: '${c2.getIdentifierMember().name}',
        }
    },`;
*/
                }
            }

        });
        return code;
    }

    this.writeClass = function (name) {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        //code += writeClassDependecies(c);
        code += '\n';
        code += `
module.exports = (sequelize, DataTypes) => {

    const ${c.name}  = sequelize.define('${c.getTablename()}',{
        ${writeTableFieldDescriptors(c)}
    }, {
        underscored: true,
    });

    ${writeBelongsTo(c)}

    return ${c.name};
};
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