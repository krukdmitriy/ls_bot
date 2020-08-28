process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const NodeCache = require( "node-cache" );
const myCache = new NodeCache();
const redis = require("redis");
const client = redis.createClient(process.env.REDIS_PORT,
    process.env.REDIS_URL,
    {auth_pass: process.env.REDIS_PASS});

client.on("error", function(error) {
    console.error(error);
});

const TOKEN = process.env.TT ;
const options = {
    webHook: {
        port: process.env.PORT,
        polling: true
    }
};
const url = process.env.APP_URL;
const bot = new TelegramBot(TOKEN, options);
bot.setWebHook(`${url}/bot${TOKEN}`);





bot.onText(/\/start/, function onEchoText(msg) {
    const {chat:{id,username}} = msg;

    !!myCache.get(username)?
        bot.sendMessage(id, 'Введите свой API-ключ командой /apikey (свой API-ключ)') :
        client.get(username, (er,reply) => {
            myCache.set(username, JSON.parse(reply), 10000000000)
            bot.sendMessage(msg.chat.id, 'Выберите дествия',inline_button());
        });


});

bot.onText(/\/apikey (.+)/ ,(msg,[source, match])=>{
    const {message_id,chat:{id,username}} = msg;

    myCache.set( username, {apikey:match}, 10000000000 );
    client.set(username,JSON.stringify({apikey:match}));

    bot.sendMessage(id,'Апи ключ сохранен',inline_button());
    bot.deleteMessage(id, message_id);
})

bot.onText(/\/myapikey/, function onEchoText(msg) {
    const {chat:{id,username}} = msg;

    bot.sendMessage(id, myCache.get(username).apikey,inline_button());
});
//-------------------------------------------------------//



bot.onText(/\Цена/, function onEchoText(msg) {
    const {chat:{id,username}} = msg;
    const user = myCache.get(username);

    smsHubRequest('getPrice',user).then(response => {
        const pricess = response.data['1'].tx;
        const pricekeys = Object.keys(pricess);
        minPirice = pricekeys[0];
        contMinPirice = pricess[pricekeys[0]];
        bot.sendMessage(id, 'Минимальная цена: '+ minPirice+ '  количество номеров: ' + contMinPirice);
    });
});

bot.onText(/\Баланс/, function onEchoText(msg) {
    const {chat:{id,username}} = msg;
    const user = myCache.get(username);

    smsHubRequest('getBalance',user).then(response => {
        bot.sendMessage(id, 'Баланс: '+ response.data.split(':')[1]+ ' руб.');
    });
});
async function smsHubRequest(type,user,status = null) {
    let response;
    switch (type) {
        case 'getBalance':
            response = await axios.get(
                'https://smshub.org/stubs/handler_api.php?api_key='+user.apikey+'&action=getBalance');
            break;
        case 'getPrice':
            response = await axios.get(
                'https://smshub.org/stubs/handler_api.php?api_key='+user.apikey+'&action=getPrices&service=tx&country=1');
            break;
        case 'getNumber':
            response =  await axios.get(
                'https://smshub.org/stubs/handler_api.php?api_key='+user.apikey+'&action=getNumber&service=tx&country=1');
            break;
        case 'getCode':
            response = await axios.get(
                'https://smshub.org/stubs/handler_api.php?api_key='+user.apikey+'&action=getStatus&id='+user.id_number);
            break;
        case 'setStatus':
            response = await axios.get(
                'https://smshub.org/stubs/handler_api.php?api_key='+user.apikey+'&action=setStatus&status='+ status +'&id='+user.id_number);
            break;
    }
    console.log('smsHubRequest',response.data);
    return response;
}



bot.onText(/\Заказать номер/, function onEditableText(msg) {
    const {chat:{id,username}} = msg;
    const user =  myCache.get(username);

    smsHubRequest('getNumber',user).then(response => {
        let status =  response.data.split(':')
        switch(status[0]){
            case 'ACCESS_NUMBER':
                myCache.set( username, {...user,id_number:status[1],number:status[2]}, 10000000000 );
                break
        }
        bot.sendMessage(id, (status[2]+'').slice(3,12) ,inline_button('getNumber'));
    });
});





bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const action = callbackQuery.data;
    const {chat:{id,username}} = callbackQuery.message;
    const user =  myCache.get(username);


    let text;

    switch (action) {
        case 'getCode':
            smsHubRequest('getCode',user).then(response => {
                text = getStatusCode(response.data);
                text.status ? bot.sendMessage(id, text.text, inline_button('getCode')):'';
            });
            break
        case 'replayCode':
            smsHubRequest('setStatus',user,3).then(response => {
                text = getStatusCode(response.data);
                bot.sendMessage(id, text.text, inline_button('replayCode'));
            });
            break
        case 'successCode':
            smsHubRequest('setStatus',user,6).then(response => {
                text = 'Активация успешно завершена';
                bot.sendMessage(id, text, inline_button());
            });
            break
        case 'cancelCode':
            smsHubRequest('setStatus',user,8).then(response => {
                text = 'Активация отменена';
                bot.sendMessage(id, text, inline_button());
            });
            break
        default:
    }


});

function inline_button(type) {
    let opts;
    switch (type) {
        case 'getNumber':
            opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Получить SMS',
                                callback_data: 'getCode'
                            },
                            {
                                text: '❌',
                                callback_data: 'cancelCode'
                            }
                        ]
                    ]
                }
            };
            break
        case 'getCode':
            opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅',
                                callback_data: 'successCode'
                            },
                            {
                                text: '🔄',
                                callback_data: 'replayCode'
                            }
                        ]
                    ]
                }
            };
            break
        case 'replayCode':
             opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Получить SMS',
                                callback_data: 'getCode'
                            },
                            {
                                text: '✅',
                                callback_data: 'successCode'
                            },
                            {
                                text: '🔄',
                                callback_data: 'replayCode'
                            }
                        ]
                    ]
                }
            };

            break
        case 'successCode':
        case 'cancelCode':
        default:
            opts = {
                reply_markup: JSON.stringify({
                    keyboard: [
                        ['Цена'],
                        ['Баланс'],
                        ['Заказать номер']
                    ]
                })
            };
            break
    }
    return opts;
}

function getStatusCode(status){
    let text;
    let type =  !!(status.indexOf(':') + 1) ? status.split(':')[0] :status;
    switch (type) {
        case 'STATUS_OK':
            text = status.split(':')[1];
            status = true;
            break;
        case 'STATUS_WAIT_CODE':
            text = 'Ожидаем смс';
            status = false;
            break;
        case 'STATUS_WAIT_RETRY':
        case 'ACCESS_RETRY_GET':
            text = 'Ожидаем нового смс';
            status = false;
            break;
    }
    return {status,text};
}

