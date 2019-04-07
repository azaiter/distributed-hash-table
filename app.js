var express = require('express');
var request = require("request");
var fs = require("fs");
var app = express();
var logger = console;
const dns = require('dns');
const util = require('util');
const async = require('async');


const SOCKET_PORT = process.env.SOCKET_PORT || 15000;
if(!process.env.MODULO_VAL){
    logger.log("ERROR: You need to set MODULO_VAL environment variable");
    process.exit(1);
}
if(!process.env.INIT_CONFIG){
    logger.log("ERROR: You need to set INIT_CONFIG environment variable");
    process.exit(1);
}
const MODULO_VAL = parseInt(process.env.MODULO_VAL) || 5;
let INIT_CONFIG = process.env.INIT_CONFIG;
INIT_CONFIG = INIT_CONFIG.split("-");
const CURRENT_HOSTNAME = INIT_CONFIG[0];
const CURRENT_INDEX = parseInt(INIT_CONFIG[1]);
let PREVIOUS_HOSTNAME = INIT_CONFIG[2];
let PREVIOUS_INDEX = parseInt(INIT_CONFIG[3]);
let SUBSEQUENT1_HOSTNAME = INIT_CONFIG[4];
let SUBSEQUENT1_INDEX = parseInt(INIT_CONFIG[5]);
let SUBSEQUENT2_HOSTNAME = INIT_CONFIG[6];
let SUBSEQUENT2_INDEX = parseInt(INIT_CONFIG[7]);
let livenessProbe = process.env.INIT_LIVENESS_PROBE || "OK";
let ips = {};

async function assignIPs(){
    ips[CURRENT_HOSTNAME] = await util.promisify(dns.lookup)(CURRENT_HOSTNAME);
    ips[PREVIOUS_HOSTNAME] = await util.promisify(dns.lookup)(PREVIOUS_HOSTNAME);
    ips[SUBSEQUENT1_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT1_HOSTNAME);
    ips[SUBSEQUENT2_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT2_HOSTNAME);
    ips[CURRENT_HOSTNAME] = ips[CURRENT_HOSTNAME].address;
    ips[PREVIOUS_HOSTNAME] = ips[PREVIOUS_HOSTNAME].address;
    ips[SUBSEQUENT1_HOSTNAME] = ips[SUBSEQUENT1_HOSTNAME].address;
    ips[SUBSEQUENT2_HOSTNAME] = ips[SUBSEQUENT2_HOSTNAME].address;
}

assignIPs();

let hashTable = {};

app.get("/insert/:key/:value", (req, res)=>{
    let key = req.params.key;
    let value = req.params.value;
    let hash = calculateKeyHash(key);

    // initial cases: if hash == any of the indexes that this node knows.
    if(hash == CURRENT_INDEX) return insertIntoCurrent(key, value, hash, res);
    if(hash == PREVIOUS_INDEX) return sendToNode(key, value, hash, PREVIOUS_INDEX, PREVIOUS_HOSTNAME, res);
    if(hash == SUBSEQUENT1_INDEX) return sendToNode(key, value, hash, SUBSEQUENT1_INDEX, SUBSEQUENT1_HOSTNAME, res);
    if(hash == SUBSEQUENT2_INDEX) return sendToNode(key, value, hash, SUBSEQUENT2_INDEX, SUBSEQUENT2_HOSTNAME, res);

    // edge case 1: first node (current index < previous index)
    if(CURRENT_INDEX < PREVIOUS_INDEX && hash > PREVIOUS_INDEX) return insertIntoCurrent(key, value, hash, res);

    // edge case 2: last node (subsequent index < current index)
    if(SUBSEQUENT1_INDEX < CURRENT_INDEX && hash > CURRENT_INDEX) return sendToNode(key, value, hash, SUBSEQUENT1_INDEX, SUBSEQUENT1_HOSTNAME, res);

    // if the current hash is between previous and current (insert in current), otherwise send to subsequent
    if(hash > PREVIOUS_INDEX && hash <= CURRENT_INDEX) return insertIntoCurrent(key, value, hash, res);
    else return sendToNode(key, value, hash, SUBSEQUENT1_INDEX, SUBSEQUENT1_HOSTNAME, res);
});

app.get("/get/:key", (req, res)=>{
    let key = req.params.key;
    findingProcess(key, CURRENT_HOSTNAME, req, res);
});

app.get("/internal/get/:key/:hostname", (req, res)=>{
    let key = req.params.key;
    let hostname = req.params.hostname;
    if(CURRENT_HOSTNAME == hostname){
        logger.log(`The searching process for ${key} reached a loop, sending NOT FOUND to client`);
        return res.send("NOT FOUND");
    }
    else {
        findingProcess(key, hostname, req, res);
    }
});


// heartbeating
setTimeout(()=>{
    logger.log("Started the heartbeating process.");
    async.forever((next)=>{
        request.get(`http://${SUBSEQUENT1_HOSTNAME}:${SOCKET_PORT}/heartbeat`, async (err, res, body)=>{
            //logger.log(`${SUBSEQUENT1_HOSTNAME} body: `, body);
            if(body !== "OK"){
                logger.log(`Heartbeat from ${CURRENT_HOSTNAME} to ${SUBSEQUENT1_HOSTNAME} failed, changing nodes chain.`);
                // change subsequent 1
                SUBSEQUENT1_HOSTNAME = SUBSEQUENT2_HOSTNAME;
                SUBSEQUENT1_INDEX = SUBSEQUENT2_INDEX;
                ips[SUBSEQUENT1_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT1_HOSTNAME);
                ips[SUBSEQUENT1_HOSTNAME] = ips[SUBSEQUENT1_HOSTNAME].address;
                logger.log(`Subsequent 1 hostname is now: ${SUBSEQUENT1_HOSTNAME}@${ips[SUBSEQUENT1_HOSTNAME]}`);

                // change subsequent 2
                request.get(`http://${SUBSEQUENT2_HOSTNAME}:${SOCKET_PORT}/internal/get/SUBSEQUENT1_HOSTNAME+":"+SUBSEQUENT1_INDEX`, async (err, res, body)=>{
                    SUBSEQUENT2_HOSTNAME = body.split(":")[0];
                    SUBSEQUENT2_INDEX = body.split(":")[1];
                    ips[SUBSEQUENT2_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT2_HOSTNAME);
                    ips[SUBSEQUENT2_HOSTNAME] = ips[SUBSEQUENT2_HOSTNAME].address;
                    logger.log(`Subsequent 2 hostname is now: ${SUBSEQUENT2_HOSTNAME}@${ips[SUBSEQUENT2_HOSTNAME]}`);
                });

                // change previous's subsequent 2 to new subsequent 1
                request.get(`http://${PREVIOUS_HOSTNAME}:${SOCKET_PORT}/internal/changehost/SUBSEQUENT2_HOSTNAME/${SUBSEQUENT1_HOSTNAME}/${SUBSEQUENT1_INDEX}`);

                // change the new subsequent to have a previous of current
                request.get(`http://${SUBSEQUENT1_HOSTNAME}:${SOCKET_PORT}/internal/changehost/PREVIOUS_HOSTNAME/${CURRENT_HOSTNAME}/${CURRENT_INDEX}`);
            }
        });
        setTimeout(()=>{next();}, 5000);
    });
}, 10000);


app.get("/heartbeat", (req, res)=>{res.send(livenessProbe)});
// Note: this is not a secure route as it uses eval of what's sent to it.
app.get("/internal/get/:varName", (req, res)=>{res.send(eval(req.params.varName))});

app.get("/leave", (req, res)=>{
    logger.log(`a LEAVE command was sent to node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]}.`);
    livenessProbe = "NOTOK";
    res.send("Successfully left the node chain.");
});

app.get("/join", (req, res)=>{
    logger.log(`a JOIN command was sent to node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]}.`);
    livenessProbe = "OK";
    // 1- change subsequent 2 of previous x2
    request.get(`http://${PREVIOUS_HOSTNAME}:${SOCKET_PORT}/internal/get/PREVIOUS_HOSTNAME+":"+PREVIOUS_INDEX`, async (err, res, body)=>{
        let PREVIOUS2_HOSTNAME = body.split(":")[0];
        let PREVIOUS2_INDEX = body.split(":")[1];
        request.get(`http://${PREVIOUS2_HOSTNAME}:${SOCKET_PORT}/internal/changehost/SUBSEQUENT2_HOSTNAME/${CURRENT_HOSTNAME}/${CURRENT_INDEX}`);
    });
    // 2- change previous subsequent 1 to current
    request.get(`http://${PREVIOUS_HOSTNAME}:${SOCKET_PORT}/internal/changehost/SUBSEQUENT1_HOSTNAME/${CURRENT_HOSTNAME}/${CURRENT_INDEX}`);
    // 3- change previous subsequent 2 to subsequent 1
    request.get(`http://${PREVIOUS_HOSTNAME}:${SOCKET_PORT}/internal/changehost/SUBSEQUENT2_HOSTNAME/${SUBSEQUENT1_HOSTNAME}/${SUBSEQUENT1_INDEX}`);
    // 4- change subsequent 1 previous to current
    request.get(`http://${SUBSEQUENT1_HOSTNAME}:${SOCKET_PORT}/internal/changehost/PREVIOUS_HOSTNAME/${CURRENT_HOSTNAME}/${CURRENT_INDEX}`);
    res.send("Successfully joined the node chain.");
});

app.get("/internal/changehost/:hostType/:hostname/:index", async (req, res)=>{
    let hostType = req.params.hostType;
    let hostname = req.params.hostname;
    let index = req.params.index;
    // this can be eliminated if I used a dictionary to save/assign them.
    switch (hostType) {
        case "SUBSEQUENT1_HOSTNAME":
            SUBSEQUENT1_HOSTNAME = hostname;
            SUBSEQUENT1_INDEX = index;
            ips[SUBSEQUENT1_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT1_HOSTNAME);
            ips[SUBSEQUENT1_HOSTNAME] = ips[SUBSEQUENT1_HOSTNAME].address;
            logger.log(`Changed ${hostType} to ${hostname}@${ips[SUBSEQUENT1_HOSTNAME]} with index of ${index}.`);
            break;
        case "SUBSEQUENT2_HOSTNAME":
            SUBSEQUENT2_HOSTNAME = hostname;
            SUBSEQUENT2_INDEX = index;
            ips[SUBSEQUENT2_HOSTNAME] = await util.promisify(dns.lookup)(SUBSEQUENT2_HOSTNAME);
            ips[SUBSEQUENT2_HOSTNAME] = ips[SUBSEQUENT2_HOSTNAME].address;
            logger.log(`Changed ${hostType} to ${hostname}@${ips[SUBSEQUENT2_HOSTNAME]} with index of ${index}.`);
            break;
        case "PREVIOUS_HOSTNAME":
            PREVIOUS_HOSTNAME = hostname;
            PREVIOUS_INDEX = index;
            ips[PREVIOUS_HOSTNAME] = await util.promisify(dns.lookup)(PREVIOUS_HOSTNAME);
            ips[PREVIOUS_HOSTNAME] = ips[PREVIOUS_HOSTNAME].address;
            logger.log(`Changed ${hostType} to ${hostname}@${ips[PREVIOUS_HOSTNAME]} with index of ${index}.`);
            break;
        default:
            break;
    }
    res.sendStatus(200);
});

function findingProcess(key, hostname, req, res){
    logger.log(`Searching for ${key} in node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]} that has index ${CURRENT_INDEX}...`)
    let found = searchCurrentNode(key);
    if(found){
        logger.log(`Key ${key} found in node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]} that has index ${CURRENT_INDEX}...`)
        return res.send(found);
    }
    else {
        logger.log(`Key ${key} NOT found in node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]} ... Sending to subsequent node ${SUBSEQUENT1_HOSTNAME}@${ips[SUBSEQUENT1_HOSTNAME]}...`);
        let internalPath = `http://${SUBSEQUENT1_HOSTNAME}:${SOCKET_PORT}/internal/get/${key}/${hostname}`;
        req.pipe(request(internalPath)).pipe(res);
    }
}

function searchCurrentNode(key){
    let found = false;
    let hash = calculateKeyHash(key);
    if(hashTable[hash] && hashTable[hash][key]){
        found = hashTable[hash][key];
    }
    return found;
}

function insertIntoCurrent(key, value, hash, res){
    let message = `Inserting ${key}:${value} of hash ${hash} into node ${CURRENT_HOSTNAME}@${ips[CURRENT_HOSTNAME]} on index ${CURRENT_INDEX}`;
    logger.log(message);
    if(hashTable[hash]){
        if(hashTable[hash][key]) hashTable[hash][key].push(value);
        else hashTable[hash][key] = [value];
    }
    else {
        hashTable[hash] = {};
        hashTable[hash][key] = [value];
    }
    return res.send(message);
}

function sendToNode(key, value, hash, nodeIndex, nodeHostname, res){
    let message = `Sending ${key}:${value} of hash ${hash} into node ${nodeHostname}@${ips[nodeHostname]} on index ${nodeIndex}`;
    logger.log(message);
    request.get(`http://${nodeHostname}:${SOCKET_PORT}/insert/${key}/${value}`);
    return res.send(message);
}

function calculateKeyHash(key){
    let sum = 0;
    for (var i = 0; i < key.length; i++) {
        sum += key.charCodeAt(i);
    }
    return (sum % MODULO_VAL) + 1;
}

app.listen(SOCKET_PORT, function () {
    logger.log(`Node ${CURRENT_HOSTNAME} on index ${CURRENT_INDEX} listening on port ${SOCKET_PORT}!`)
});