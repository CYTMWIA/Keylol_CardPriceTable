// ==UserScript==
// @name         Keylol_主楼游戏卡价表
// @version      2020.3.7.2
// @description  计算主楼游戏的卡牌价格
// @author       CYTMWIA
// @match        http*://keylol.com/t*
// @match        http*://keylol.com/forum.php?*mod=viewthread*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // 主楼及帖子信息
    let MAIN_POST, PID, TID

    let APPIDS = [] // 帖子内所有 appid

    let REQUESTING = 0 //记录当前存活请求数
    
    let APPINFO_KLDB = {} // 数据来自 steamdb.keylol.com , 卡牌价格数据与现实数据有延迟, 

    let CARDINFO_ST = {} // 卡牌价格数据额外从steam市场获取


    // 初始化
    function init() {
        MAIN_POST = document.getElementById('postlist').children[1]
        
        PID = MAIN_POST.id.substring(5)

        TID = document.getElementById('thread_subject').href
        TID = TID.substring(TID.lastIndexOf('/')+2,TID.indexOf('-'))

        APPIDS = []

        REQUESTING = 0

        APPINFO_KLDB = {}

        CARDINFO_ST = {}
    }


    // 通用 网络请求
    function request(kwargs={}) {
        REQUESTING+=1

        let _kwargs = {
            method:'GET',
            timeout:3000,
            onabort: ()=>{REQUESTING-=1},
            onerror: ()=>{REQUESTING-=1},
            ontimeout: ()=>{REQUESTING-=1},
            onload: ()=>{REQUESTING-=1},
        }
        for (let [key,val] of Object.entries(kwargs)) {
            if (['onabort','onerror','ontimeout','onload'].includes(key)) {
                _kwargs[key] = (response) => {
                    REQUESTING-=1
                    val(response)
                }
            } else {
                _kwargs[key] = val
            }
        }
        
        return GM_xmlhttpRequest(_kwargs)
    }


    // Appid 相关
    function addAppid(appid) {
        if (!APPIDS.includes(appid))
            APPIDS.push(appid)
    }

    function addAppidFromLink (link) {
        let appid = link.split('/')[4]
        addAppid(appid)
    }

    function addAppidsFromString(s) {
        let links = s.match(/https:\/\/store\.steampowered\.com\/app\/\d+/g)
        if (links!==null) {
            links.forEach((link,idx)=>{
                addAppidFromLink(link)
            })
        }
    }

    function addAppidsFromThreadIndex(){
        let threadindex = document.getElementById('threadindex') //目录
        if (threadindex !== null) {
            let max = threadindex.getElementsByTagName('li').length
            if (max>=2) {
                for (let i=2;i<=max;i+=1) {
                    request({
                        method:'GET',
                        url:'https://keylol.com/forum.php?mod=viewthread&threadindex=yes&tid='+TID+'&viewpid='+PID+'&cp='+i,
                        onload:(response) => {
                            addAppidsFromString(response.responseText)
                        }
                    })
                }
            }
        }
    }


    // 获取及解析数据
    function parseKeylolSteamdbResponseText(text,appid){
        let proc = (obj) => { return obj } // will be used in eval
        APPINFO_KLDB[appid] = eval(text)
        if (APPINFO_KLDB[appid].card===undefined) { // 对齐别的有卡的游戏（我不想在后面的代码写判断了）
            APPINFO_KLDB[appid].card={
                "booster": 0,
                "normal": {
                    "count": 0,
                    "average": 0
                },
                "foil": {
                    "count": 0,
                    "average": 0
                }
            }
        }
    }

    function getAppInfo(appid,callback) {
        if (APPINFO_KLDB[appid] !== undefined) {
            callback()
        } else {
            request({
                method: 'GET',
                url: 'https://steamdb.keylol.com/app/'+appid+'/data.js?v=38',
                onload: function (response) {
                    if (response.status === 200) {
                        parseKeylolSteamdbResponseText(response.responseText, appid)
                    } else {
                        console.log('从 steamdb.keylol.com 查询 '+appid+' 失败', response)
                    }
                    callback()
                }
            })
        }
    }
    
    function parseSteamMarketResponseText(text,appid) {
        let json = JSON.parse(text)
        if (json['success']===true) {
            let cardinfo = {
                'raw_data': json,
                'normal': {
                    'count': 0,
                    'cards': [
                        /*
                        {
                            'hash_name': string
                            'sell_price': number
                            'sell_price_text': string
                        },
                        */
                    ]
                    
                },
                'foil': {
                    'count': 0,
                    'cards': [],
                },
                'booster_pack': {
                    'hash_name': '',
                    'sell_price': 0
                }
            }

            if (json['total_count']!==0) {
                json.results.forEach((item,idx)=>{
                    if (item.hash_name.includes('Booster Pack')) {
                        cardinfo.booster_pack.hash_name = item.hash_name
                        cardinfo.booster_pack.sell_price = item.sell_price
                    } else if (item.hash_name.includes('(Foil')) {
                        cardinfo.foil.cards.push({
                            'hash_name':item.hash_name,
                            'sell_price':item.sell_price,
                            'sell_price_text':item.sell_price_text
                        })
                    } else {
                        cardinfo.normal.cards.push({
                            'hash_name':item.hash_name,
                            'sell_price':item.sell_price,
                            'sell_price_text':item.sell_price_text
                        })
                    }
                })

                cardinfo.normal.count = cardinfo.normal.cards.length
                cardinfo.foil.count = cardinfo.foil.cards.length

                if (CARDINFO_ST['currency']===undefined)
                    CARDINFO_ST['currency'] = json['results'][0]['sell_price_text'].replace(/\d+\.*\d*/,'').trim()
            }
            
            CARDINFO_ST[appid] = cardinfo
        }
    }

    function getCardInfo(appid,callback) {
        if (CARDINFO_ST[appid] !== undefined) {
            callback()
        } else {
            request({
                method: 'GET',
                url: 'https://steamcommunity.com/market/search/render/?start=0&count=50&appid=753&category_753_Game[]=tag_app_'+appid+'&category_753_item_class[]=tag_item_class_2&category_753_item_class[]=tag_item_class_5&norender=1',
                timeout: 8000,
                onload: function (response) {
                    if (response.status === 200) {
                        parseSteamMarketResponseText(response.responseText, appid)
                    }

                    if (CARDINFO_ST[appid]===undefined) {
                        console.log('从 Steam市场 搜索 '+appid+' 失败', response)
                    }

                    callback()
                }
            })
        }
    }


    // 工具
    function round2(num) {
        return Math.round(num*100)/100
    }

    function sumArray(a,val_func=(v)=>{return v}) {
        return a.reduce((acc,cur)=>{
            return acc+val_func(cur)
        }, 0)
    }

    function averageArray(a,val_func=(v)=>{return v}) {
        return sumArray(a,val_func)/a.length
    }


    // 基于数据的工具函数
    function isDlc(appid) {
        let description = APPINFO_KLDB[appid]['description']
        return /该内容需要在 Steam 拥有基础游戏.*?才能运行/.test(description) || /这是.*?的附加内容，但不包含基础游戏/.test(description)
    }

    function hasCards(appid) {
        return APPINFO_KLDB[appid].card.normal.count !== 0
    }

    function calSumSellPrice(cards) {
        return sumArray(cards,(v)=>{return v.sell_price})
    }

    function calAvgSellPrice(cards) {
        if (cards.length===0) 
            return 0
        else
            return calSumSellPrice(cards)/cards.length
    }

    // UI
    document.head.innerHTML+= ''
        +'<style>'
        +'.grid_close {'
        +'    border-style: solid;'
        +'    border-width: thin;'
        +'    border-color: grey;'
        +'}'
        +'.trow_a {'
        +'    background-color: whitesmoke;'
        +'}'
        +'.trow_b {'
        +'    background-color: rgb(229, 237, 242);'
        +'}'
        +'.text_block {'
        +'    border-style: none;'
        +'    background-color: rgb(87, 186, 232);'
        +'    color: white;'
        +'}'
        +'.text_block_grey {'
        +'    border-style: none;'
        +'    background-color: grey;'
        +'    color: lightgray;'
        +'}'
        +'.text_block_dark {'
        +'    border-style: none;'
        +'    background-color: #3e3e3e;'
        +'    color: rgb(229, 237, 242);'
        +'}'
        +'.table_btn {'
        +'    position: relative;'
        +'    top: 1.5ex;'
        +'    margin-left: 1.5ch;'
        +'}'
        +'.float_infobox {'
        +'    position: fixed;'
        +'    z-index: 99;'
        +'    height: 100px'
        +'    width: 100px'
        +'}'
        +'</style>'


    let PRICE_TABLE_BODY
    let CAL_BTN, HIDE0CARD_BTN
    let FLOAT_INFOBOX

    let COLUMNS_ORDER = [
        {
            'text': 'Appid',
            'rowkey': 'appid'
        },
        {
            'text': '名称',
            'rowkey': 'name'
        },
        {
            'text': '卡牌数',
            'rowkey': 'count'
        },
        {
            'text': '普卡均价',
            'rowkey': 'nc_avg_sp'
        },
        {
            'text': '普卡半套',
            'rowkey': 'nc_half'
        },
        {
            'text': '普卡一套',
            'rowkey': 'nc_all'
        },
        {
            'text': '闪卡均价',
            'rowkey': 'fc_avg_sp'
        },
        {
            'text': '闪卡半套',
            'rowkey': 'fc_half'
        },
        {
            'text': '闪卡一套',
            'rowkey': 'fc_all'
        },
        {
            'text': '补充包价格',
            'rowkey': 'booster_pack_sp'
        },
        {
            'text': '备注',
            'rowkey': 'remark'
        }
    ]

    let COLUMNS_HIDE = []

    let APPIDS_HIDE = []

    let HIDE0CARD = false

    function addBasicUi() {
        MAIN_POST.getElementsByClassName('plc')[0].innerHTML = ''
            +'<br>'
            +'<div style="background-color: rgb(229, 237, 242);">'
            +'    <div class="text_block">卡牌价格表</div>'
            +'    <div id="table_btns"></div>'
            +'    <br><br>'
            +'    <table id="price_table" class="grid_close" style="border-style: solid;">'
            +'        <tbody id="price_table_body"></tbody>'
            +'    </table>'
            +'    <div id="float_infobox" class="text_block_dark float_infobox" style="display: none;"></div>'
            +'</div>' + MAIN_POST.getElementsByClassName('plc')[0].innerHTML

        PRICE_TABLE_BODY = document.getElementById('price_table_body')
        FLOAT_INFOBOX = document.getElementById('float_infobox')
    }

    function addBtn(text) {
        let btns = document.getElementById('table_btns')

        let btn = document.createElement('button')
        btn.className = 'table_btn text_block'
        btn.innerText = text

        return btns.appendChild(btn)
    }

    function addRow(obj,headrow=false) {
        let row = document.createElement('tr')

        if (PRICE_TABLE_BODY.children.length%2===0) {
            row.className = 'trow_a'
        } else {
            row.className = 'trow_b'
        }

        COLUMNS_ORDER.forEach((col)=>{
            let grid = ''
            if (headrow) {
                grid = col.text
            } else if (obj[col.rowkey]!==undefined) {
                grid = obj[col.rowkey]
            } 
            row.innerHTML += '<td class="grid_close">'+grid+'</td>'
        })

        PRICE_TABLE_BODY.appendChild(row)
    }

    function clearTableBody() {
        PRICE_TABLE_BODY.innerHTML = ''
    }

    function makeTableWithData(){
        clearTableBody()
        addRow({},true)

        let sums = {'count':0,'nc_half':0,'nc_all':0,'fc_half':0,'fc_all':0,}
        APPIDS.forEach((appid,idx)=>{
            let kldb = APPINFO_KLDB[appid]
            let card = CARDINFO_ST[appid]

            if (kldb===undefined||card===undefined) return;

            if (HIDE0CARD && !hasCards(appid)) return;
            if (APPIDS_HIDE.includes(appid)) return;
            
            let row = {
                'appid': appid,
                'name': '<a href="https://store.steampowered.com/app/'+appid+'" target="_blank" class="steam-info-link steam-info-loaded">'+kldb.name+'</a>',
                'count': kldb.card.normal.count,
                'nc_avg_sp': round2(calAvgSellPrice(card.normal.cards)/100),
                //'nc_half': round2(this.nc_avg_sp*Math.ceil(card.normal.count/2)/100),
                'nc_all': round2(calSumSellPrice(card.normal.cards)/100),
                'fc_avg_sp': round2(calAvgSellPrice(card.foil.cards)/100),
                //'fc_half': round2(this.fc_avg_sp*Math.ceil(card.foil.count/2)/100),
                'fc_all': round2(calSumSellPrice(card.foil.cards)/100),
                'booster_pack_sp': round2(card.booster_pack.sell_price/100),
                'remark': ''
            }
            row.nc_half = round2(row.nc_avg_sp*Math.ceil(card.normal.count/2))
            row.fc_half = round2(row.fc_avg_sp*Math.ceil(card.foil.count/2))

            let counts = [card.normal.count,card.foil.count,kldb.card.normal.count,kldb.card.foil.count]
            if (!counts.every((val)=>{return val===counts[0]},counts)) {
                row.remark = ''
                    +'Steam市场普卡数：' + card.normal.count + '<br>'
                    +'Steam市场闪卡数：' + card.foil.count + '<br>'
                    +'其乐数据库普卡数：' + kldb.card.normal.count + '<br>'
                    +'其乐数据库闪卡数：' + kldb.card.foil.count + '<br>'
            }

            Object.keys(sums).forEach((key)=>{
                sums[key] += row[key]
            })

            row.nc_avg_sp = '<p appid="'+appid+'" card_border="normal" class="avgsp">'+row.nc_avg_sp+'</p>'
            row.fc_avg_sp = '<p appid="'+appid+'" card_border="foil" class="avgsp">'+row.fc_avg_sp+'</p>'

            addRow(row)
        })

        Object.keys(sums).forEach((key)=>{
            sums[key] = round2(sums[key])
        })
        sums.appid = '总和'

        addRow(sums)

        let avgsp = document.getElementsByClassName('avgsp')
        for (let idx=0;idx<avgsp.length;idx+=1) {
            avgsp[idx].addEventListener('mousemove',(evt)=>{
                let ele = evt.currentTarget

                let appid = ele.getAttribute('appid')
                let cb = ele.getAttribute('card_border')
                
                FLOAT_INFOBOX.innerHTML = 'Appid : '+appid+'<br>'
                CARDINFO_ST[appid][cb].cards.forEach((card)=>{
                    FLOAT_INFOBOX.innerHTML += card.hash_name + ' : ' + card.sell_price_text + '<br>'
                })
                
                FLOAT_INFOBOX.style.display = '' //若元素不可见时，则其 .clientHeight 等于零，故先显示，后调节位置
                FLOAT_INFOBOX.style.top = evt.clientY-FLOAT_INFOBOX.clientHeight-1 + 'px'
                FLOAT_INFOBOX.style.left = evt.clientX+1 + 'px'
            })
            avgsp[idx].addEventListener('mouseout',(e)=>{
                FLOAT_INFOBOX.style.display = 'none'
            })
        }
    }

    function onclick_CAL_BTN() {
        if (REQUESTING<=0)
            APPIDS.forEach((appid,index)=>{
                getAppInfo(appid,()=>{
                    if (APPINFO_KLDB[appid]===undefined) {
                        console.log('从 steamdb.keylol.com 查询 '+appid+' 失败')
                        return;
                    }

                    if (!isDlc(appid)) {
                        getCardInfo(appid, ()=>{ 
                            if (CARDINFO_ST[appid]===undefined) {
                                console.log('从 Steam市场 搜索 '+appid+' 失败')
                                return;
                            }

                            makeTableWithData() 
                        })
                    }
                })
            })
    }

    function onclick_HIDE0CARD_BTN() {
        HIDE0CARD = !HIDE0CARD
        
        if (HIDE0CARD) {
            HIDE0CARD_BTN.innerText = '显示无卡'
        } else {
            HIDE0CARD_BTN.innerText = '隐藏无卡'
        }

        if (Object.keys(APPINFO_KLDB).length>0)
            makeTableWithData()
    }

    function makeUi() {
        addBasicUi()
        
        CAL_BTN = addBtn('生成表格')
        CAL_BTN.addEventListener('click',onclick_CAL_BTN)

        HIDE0CARD_BTN = addBtn('隐藏无卡')
        HIDE0CARD_BTN.addEventListener('click',onclick_HIDE0CARD_BTN)
    }


    // MAIN
    init()

    addAppidsFromString(MAIN_POST.innerHTML)
    addAppidsFromThreadIndex()

    if (APPIDS.length===0) return;

    makeUi()

    setInterval(()=>{
        if (document.getElementById('price_table')===null){
            makeUi()
        }

        if (REQUESTING) {
            CAL_BTN.className = 'table_btn text_block_grey'
        } else {
            CAL_BTN.className = 'table_btn text_block'
        }
    },250)

})();