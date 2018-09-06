const fs = require('fs');
const fetch = require('node-fetch');
const html2markdown = require('html-to-markdown');
const config = require('./config');
const Writer = require('./writer-sql');

const writer = new Writer();

const parseType = type => {

    if (/ or /g.test(type)) {
        return parseType(type.replace(/^(.+) or .+$/g,'$1'));
    } else if (/^<a href="#[^"]+">(.+)<\/a>/g.test(type)) {
        return parseType(type.replace(/^<a href="#[^"]+">(.+)<\/a>/g,'$1'))
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
        return parseType(type.replace(/^Array of (.+)$/g,'$1[]'));
    } else {
        return type.trim();
    }
}


const getClassNamesDescriptions = function (html) {
    
    const data = [];

    const r_str = `<h4><a class="anchor" name="[^"]+" href="#[^"]+"><i class="anchor-icon"><\/i><\/a>(.+)<\/h4>
<p>(.+)<\/p>
<table class="table">
<tbody>
<tr>
<td><strong>(Field|Parameters)</strong></td>
<td><strong>Type</strong></td>
<td><strong>Description</strong></td>
</tr>`;

    let r = new RegExp(r_str,'g');
    let match = r.exec(html);

    while (match !== null) {
        data.push({
            'name': match[1],
            'desc': html2markdown.convert(match[2]),
        });
        match = r.exec(html);
    }

    return data;
}

const getClassMembers = function (html,className) {
    const data = [];

    const r_str = `<h4><a class="anchor" name="[^"]+" href="#[^"]+"><i class="anchor-icon"></i></a>${className}</h4>
<p>.+</p>
<table class="table">
<tbody>
<tr>
<td><strong>(Field|Parameters)</strong></td>
<td><strong>Type</strong></td>
<td><strong>Description</strong></td>
</tr>
((<tr>
<td>.+</td>
<td>.+</td>
<td>.+</td>
</tr>
)+)</tbody>
`;

    const s_str = `<tr>
<td>(.+)</td>
<td>(.+)</td>
<td>(.+)</td>
</tr>`; 

    const r = new RegExp(r_str,'g');
    const s = new RegExp(s_str,'g');


    let match = r.exec(html);
    while (match !== null) {
        let submatch = s.exec(match[2]);
        while (submatch !== null) {
            data.push({
                'name': submatch[1],
                'type': writer.parseType(submatch[2]),
                'desc': html2markdown.convert(submatch[3]),
                'optional': /^<em>Optional/g.test(submatch[3])
            });
            submatch = s.exec(match[2]);
        }
        match = r.exec(html);
    }

    return data;
}



const parseHtml = function (html) {
    
    const classesInfo = getClassNamesDescriptions(html);
    
    classesInfo.forEach( classInfo => {
        const members = getClassMembers(html,classInfo.name);
        writer.addClass(classInfo.name,classInfo.desc,members);
    });

    console.log('Total classes: '+writer.length);

    writer.forEachClass(c => {
        fs.writeFile(
            config.targetFolder+c.getFilename(),
            writer.writeClass(c),
            function () {}
        );
    })

}



fetch(config.targetUrl)
    .then( res => res.text())
    .then( parseHtml )