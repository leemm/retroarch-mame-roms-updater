const config = require('./config.json');

const path = require('path');
const chalk = require('chalk');
const icons = require('log-symbols');
const axios = require('axios');
const createTemp = require('create-temp-directory');
const fs = require('fs');
const ftp = require('basic-ftp');

const cacheFileLocation = path.join(__dirname, './cache.txt');

const start = async () => {
    const tmpPath = await createTemp.createTempDirectory();
    const iplParts = path.parse(config.iplLocation);
    const iplLocationLocal = path.join(tmpPath.path, iplParts.base);

    try {

        const cache = loadCache();

        // Download ipl file
        const client = new ftp.Client();
        client.ftp.verbose = config.verbose;

        await client.access(config.ftp);
        await client.cd(iplParts.dir);
        await client.downloadTo(iplLocationLocal, iplParts.base);

        // Get array of roms
        const roms = JSON.parse(fs.readFileSync(iplLocationLocal, { encoding:'utf8' })).items.map(item => { return { path: item.path, label: item.label }; });//.slice(0, 15);
        
        // Remote download roms
        for await (const rom of roms) {

            console.log('\n' + chalk.cyanBright(rom.label + ` (${path.basename(rom.path)})`));

            if (!cache.includes(rom.path)){

                const romParts = path.parse(rom.path);
                const remoteUrl = config.newRomsRootUrl + romParts.base;

                const localFile = path.join(tmpPath.path, romParts.base);

                process.stdout.write(chalk.grey('Downloading... '));

                await download(remoteUrl, localFile);

                process.stdout.write(icons.success + '\n');

                await client.cd(romParts.dir);
                
                process.stdout.write(chalk.grey('Copying to ftp server... '));
                
                await client.uploadFrom(localFile, romParts.base);

                process.stdout.write(icons.success + '\n');

                saveCache(rom.path);
            } else {
                console.log(chalk.grey('...is in cache'));
            }
        };

        client.close();

        console.log('\n');

    }
    catch(err) {
        console.error(err);
    }
    finally {
        fs.rmSync(iplLocationLocal);
        tmpPath.remove();
    }
}

const loadCache = () => {
    if (fs.existsSync(cacheFileLocation)) {
        const nowDate = new Date().getTime();
        const stats = fs.statSync(cacheFileLocation);
        const dif = (nowDate - stats.mtimeMs) / 1000;

        if (dif > 3600){ // 1 hour
            fs.rmSync(cacheFileLocation);
            return [];
        }

        return fs.readFileSync(cacheFileLocation, { encoding:'utf8' }).split('\n');
    } else {
        return [];
    }
}

const saveCache = (romPath) => {
    fs.appendFileSync(cacheFileLocation, romPath + '\n');
}

const download = async (url, path) => {
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
    }

    await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: {},
    }).then(function (response) {
        const writer = fs.createWriteStream(path);

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error;

            writer.on('error', (err) => {
                error = err;
                writer.close();
                reject(err);
            });

            writer.on('close', () => {
                if (!error) {
                    resolve(true);
                }
            });
        });
    });

    return true;

};

start();