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
        return this.name + '.php';
    }

    this.getImportFilename = function () {
        return this.getFilename().replace(/.php$/g,'');
    }

}

const lowerCamelCase = function (name) {
    let index = name.search(/_[a-z]/g);
    while (index >= 0) {
        name = name.substr(0,index) + name[index+1].toUpperCase() + name.substr(index+2,name.length);
        index = name.search(/_[a-z]/g);
    }

    return name;
}

const upperCamelCase = function (name) {
    name = lowerCamelCase(name);
    return name.charAt(0).toUpperCase() + name.slice(1);
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
        return `
<?php

namespace App;

`;
    }

    const writeClassFillable = (name) => {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code +=`
    protected $fillable = [`;
        c.members.forEach(member => {
            code += `
        '${member.name}',`;
        })

        code += `
    ];
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
    public function get${upperCamelCase(member.name)}Attribute() {
        return $this->attributes['${member.name}'];
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
            const isClass = isMemberTypeAClass(member.type) && member.type.substr(-2) !== '[]';
            code += `
    public function set${upperCamelCase(member.name)}Attribute(${isClass ? member.type+' ' : ''}\$${lowerCamelCase(member.name)}) {
        $this->attributes['${member.name}'] = \$${lowerCamelCase(member.name)};
    }
`;
        })

        code += ``;
        return code;
    }

    this.writeClass = function (name) {
        let code = '';
        const c = (name instanceof TelegramClass) ? name : this.getClass(name);
        code += writeClassDependecies(c);
        code += '\n';
        code += `

class ${c.name} extends BaseModel {

    /**
     * The attributes that are mass assignable.
     *
     * @var array
     */
${writeClassFillable(c)}

    /* Getters*/
${writeClassGetters(c)}

    /* Setters*/
${writeClassSetters(c)}

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