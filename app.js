const fs = require('fs');

const axios = require('axios');
const cyrillicToTranslit = require('cyrillic-to-translit-js');

const {transform} = cyrillicToTranslit();

const catalogueUrl = `/search-entities/OBJECT`
const pageUrl = `/entity/OBJECT';`
const file = 'out.csv';
const log = 'log.txt';
const imagesDirectory = './images/';

const separator = ';';

let start = process.argv[0];

const ArtsAcademyClient = axios.create({
    baseURL: 'https://collection.artsacademymuseum.org/api',
});

fs.readFile(file, function(err, data) {
    if (data.length === 0) {
        createHeaders();
    }
    fetchCatalogue();
});

function fetchCatalogue() {
    ArtsAcademyClient.post(catalogueUrl, {
        count: 20,
        filters: {
            fund: ['14']
        },
        query: null,
        sort: '90',
        start,
    }).then(({ statusCode, data }) => {
        if (statusCode === 200) {
            data.data.map(item => item.id).forEach(id => {
                fetchPage(id);
            });
        }
    });
}

function fetchPage(id) {
    ArtsAcademyClient.get(`${pageUrl}/${id}`).then(({ statusCode, data }) => {
        if (statusCode === 200) {
            createRecord(data, id).then((_) => {
                console.log('Record created.');
            });
        } else {
            console.log('Error while fetching page url: ' + id);
            updateLog(id);
        }
    });
}

async function createRecord(data, id) {
    if (!data || !data.image || !data.data) {
        console.log('Error while data parsing: ' + id);
        updateLog(id);
    }

    let result = {};
    let info = data.data;

    if (Array.isArray(info)) {
        info.forEach(item => {
            if (item.attribute === 'author' && item.data.length) {
                result.author = (item.data[0].title || '').replace(/\"/g, '\\"');
            }

            if (item.attribute === 'object_title' && item.value.length) {
                result.title = (item.value[0] || '').replace(/\"/g, '\\"');
            }

            if (item.attribute === 'material_techniq' && item.value.length) {
                [result.material = '', result.technique = ''] = (item.value[0] || '').split(separator);
            }

            if (item.attribute === 'dimensions' && item.value.length) {
                result.dimensions = item.value[0] || '';
            }

            if (item.attribute === 'typeiss' && item.data.length) {
                result.type = item.data[0].title || '';
            }
        });
    }

    let dir = findDirectory(transform(result.author || 'unsorted'));
    let filenameArr = data.image.split('/');
    let filename = dir + '/' + filenameArr[filenameArr.length-1];

    await downloadImage(data.image + '?w=3000&h=3000', filename).then(res => {
        let record = [
            result.author,
            result.title,
            result.material,
            result.technique,
            result.dimensions,
            result.type,
            dir,
            filenameArr[filenameArr.length-1]
    ].join(separator) + '\n';

        fs.appendFile(file, record, function (err) {
            if (err) throw err;
            console.log(record);
        });

    }, (err) => {
        updateLog(id);
    })
}

function findDirectory(name) {
    let dir = imagesDirectory + name;

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    return dir;
}

async function downloadImage(url, image_path) {
    return ArtsAcademyClient.get(url, {responseType: 'stream'})
        .then((response) => new Promise((resolve, reject) => {
            response.data
                .pipe(fs.createWriteStream(image_path))
                .on('finish', resolve)
                .on('error', reject);
        }));
}

function createHeaders() {
    let headers = [
        'Author', 'Title', 'Material', 'Technique', 'Dimensions', 'Type', 'Folder', 'Image'
    ].join(separator) + '\n';

    fs.appendFile('out.csv', headers, function (err) {
        if (err) throw err;
        console.log('Headers created:');
        console.log(headers);
    });
}

function updateLog(id) {
    fs.appendFile(log, id + '\n', function (err) {
        if (err) throw err;
        console.log('Log updated');
    });
}
