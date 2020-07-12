// ==UserScript==
// @name         Keylol_主楼游戏卡价表
// @version      2020.7.12.0
// @description  计算主楼游戏的卡牌价格
// @author       CYTMWIA
// @match        http*://keylol.com/t*
// @match        http*://keylol.com/forum.php?*mod=viewthread*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/vue@2.6.11
// ==/UserScript==

(function() {
    'use strict';

    ////////////////////////////////////////////////////////////////////////////
    // 网络请求

    let REQUESTING = {} // 记录当前存活请求数
    let REQUESTS_FAIL = 0 // 失败的请求总数

    function increaseRequesting(host, count=1) {
        if (REQUESTING[host]===undefined) 
            REQUESTING[host] = count
        else 
            REQUESTING[host] += count
    }

    function decreaseRequesting(host, count=1) {
        REQUESTING[host] -= count
    }

    function countRequesting(host=undefined) {
        if (host===undefined) {
            let total = 0
            Object.keys(REQUESTING).forEach(function (host) {
                total += REQUESTING[host]
            })
            return total
        } else {
            return REQUESTING[host]===undefined?0:REQUESTING[host]
        }
    }

    function parseHost(url) {
        return url.match(/\/\/(.*?)[/]/)[1]
    }

    function request(kwargs={}) {
        let host = parseHost(kwargs.url)
        increaseRequesting(host)

        let _request_fail = ()=>{ REQUESTS_FAIL+=1; decreaseRequesting(host) }

        let _kwargs = {
            method:'GET',
            timeout:3000,
            onabort: _request_fail,
            onerror: _request_fail,
            ontimeout: _request_fail,
            onload: ()=>{ decreaseRequesting(host) },
        }
        for (let [key,val] of Object.entries(kwargs)) {
            if (['onabort','onerror','ontimeout'].includes(key)) {
                _kwargs[key] = (response) => {
                    _request_fail()
                    return val(response)
                }
            } else if (['onload'].includes(key)) {
                _kwargs[key] = (response) => {
                    decreaseRequesting(host)
                    return val(response)
                }
            } else {
                _kwargs[key] = val
            }
        }
        
        return GM_xmlhttpRequest(_kwargs)
    }

    ////////////////////////////////////////////////////////////////////////////
    // 主楼及帖子信息

    let MAIN_POST, PID ,TID
    let APPIDS = new Set()

    function addAppidsFromString(s) {
        let links = s.match(/https:\/\/store\.steampowered\.com\/app\/\d+/g)
        if (links!==null)
            links.forEach((link,idx)=>{
                let appid = link.split('/')[4]
                APPIDS.add(appid)
            })
    }

    let _old_main_post_content
    setInterval(function () {
        MAIN_POST = $('postlist').children[1]
        
        PID = MAIN_POST.id.substring(5)
        
        TID = $('thread_subject').href
        TID = TID.substring(TID.lastIndexOf('/')+2,TID.indexOf('-'))

        let main_post_content = MAIN_POST.innerHTML
        if (main_post_content!==_old_main_post_content){
            APPIDS.clear()
            addAppidsFromString(main_post_content)
        }
        _old_main_post_content = main_post_content
    }, 500)

    ////////////////////////////////////////////////////////////////////////////
    // 数据获取
    // APP信息: https://steamdb.keylol.com/app/{{appid}}/data.js?v=38
    // 卡价信息: (包括 普卡,闪卡,补充包)
    //    https://steamcommunity.com/market/search/render/?start=0&count=50&appid=753&category_753_Game[]=tag_app_'+appid+'&category_753_item_class[]=tag_item_class_2&category_753_item_class[]=tag_item_class_5&norender=1
    
    let PAUSE_DATA_SPIDER = true

    let APPS = {} // Steam应用类型: 游戏 DLC 音视频
    let APPIDS_CARDS = new Set() // 有卡应用, 根据其乐SteamDB判断
    let APPS_MARKET = {} // 卡牌及补充包价格, 来自Steam市场

    let RESPONSE_EXCEPTIONS = 0 // 网络请求成功, 但响应异常的次数

    setInterval(function () {
        if (PAUSE_DATA_SPIDER) return undefined

        for (let appid of APPIDS) {
            if (countRequesting('steamdb.keylol.com')===0&&APPS[appid]===undefined) {
                request({
                    url:'https://steamdb.keylol.com/app/'+appid+'/data.js?v=38',
                    onload: function (response) {
                        if (response.status === 200) { 
                            let proc = (x) => { return x }
                            APPS[appid] = eval(response.responseText)
                            if (APPS[appid].card!==undefined)
                                APPIDS_CARDS.add(appid)
                        } else {
                            RESPONSE_EXCEPTIONS += 1
                            console.log('从steamdb.keylol.com查询'+appid+'失败')
                            console.log(response.responseText)
                        }
                    }
                })
            }
        }

        for (let appid of APPIDS_CARDS) {
            if (countRequesting('steamcommunity.com')===0&&APPS_MARKET[appid]===undefined) {
                request({
                    url: 'https://steamcommunity.com/market/search/render/?start=0&count=50&appid=753&category_753_Game[]=tag_app_'+appid+'&category_753_item_class[]=tag_item_class_2&category_753_item_class[]=tag_item_class_5&norender=1',
                    onload: function (response) {
                        if (response.status === 200) { 
                            APPS_MARKET[appid] = JSON.parse(response.responseText)['results']
                        } else {
                            RESPONSE_EXCEPTIONS += 1
                            console.log('从steamcommunity.com查询'+appid+'失败')
                            console.log(response.responseText)
                        }
                    }
                })
            }
        }
        
    }, 100)

    ////////////////////////////////////////////////////////////////////////////
    // UI 
    GM_addStyle(''
        +'.cpt_text_block {'
        +'    border-style: none;'
        +'    background-color: rgb(87, 186, 232);'
        +'    color: white;'
        +'}'
        +'.cpt_text_block_grey {'
        +'    border-style: none;'
        +'    background-color: grey;'
        +'    color: lightgray;'
        +'}'
        +'.cpt_indent_1 {'
        +'    width: 98%;'
        +'    margin-left: auto;'
        +'    margin-right: auto;'
        +'}'
        +'.cpt_indent_2 {'
        +'    width: 96%;'
        +'    margin-left: auto;'
        +'    margin-right: auto;'
        +'}'
        +'.cpt_area_ctrl {'
        +'    display: grid;'
        +'    grid-auto-columns: max-content;'
        +'    grid-auto-flow: column;'
        +'}'
        +'.cpt_row_app {'
        +'    display: grid;'
        +'    grid-template-columns: repeat(9, 11%); '
        +'    background-color: #f0f3f4;'
        +'}'
        +'.cpt_row_market {'
        +'    display: grid;'
        +'    grid-template-columns: repeat(3, 33%);'
        +'    background-color: white;'
        +'    border-bottom: solid;'
        +'    border-width: thin;'
        +'    border-color: rgb(229, 237, 242);'
        +'}'
    )

    let CPT_PANEL, CPT_TABLE

    setInterval(function () {
        if (
            (APPIDS.size===0&&Object.keys(APPS).length===0)
            ||$('cpt_panel')!==null
        ) return undefined

        MAIN_POST.getElementsByClassName('plc')[0].innerHTML = ''
            +'<div style="background-color: rgb(229, 237, 242); padding-bottom: 1ch; margin-top: 1ch;">'
            +'    <div class="cpt_text_block">卡牌价格表</div>'
            +'    <div id="cpt_panel" class="cpt_indent_1 cpt_area_ctrl" style="margin-top: 1ch;">'
            +'        <button v-bind:class="startable?\'cpt_text_block\':\'cpt_text_block_grey\'" v-on:click="clickStart">{{startable?"启动":"停止"}}查询</button>'
            +'        <button class="cpt_text_block" style="margin-left: 1ch;" v-on:click="clickHide0Card">{{hide0card?"显示":"隐藏"}}无卡</button>'
            +'        <div style="margin-left: 1ch;">网络请求 {{requesting}} | 请求失败 {{requests_fail}} | Appid数 {{appids_count}} | 其乐SteamDB已查询 {{kldb_queried}} | 有卡应用 {{card_apps}} | Steam市场已查询 {{steam_queried}}</div>'
            +'    </div>'
            +'    <div id="cpt_table" style="text-align: center; margin-top: 1ch;">'
            +'        <div v-show="apps.length">'
            +'            <div class="cpt_indent_1 cpt_row_app">'
            +'                <div>APP</div>'
            +'                <div>卡牌数</div>'
            +'                <div>普卡均价</div>'
            +'                <div>普卡半套</div>'
            +'                <div>普卡一套</div>'
            +'                <div>闪卡均价</div>'
            +'                <div>闪卡半套</div>'
            +'                <div>闪卡一套</div>'
            +'                <div>补充包</div>'
            +'            </div>'
            +'        </div>'
            +'        <div style="margin-top: 0.5ch;" v-for="app in apps_show" v-show="String(app[\'卡牌数\']).replace(\'*\',\'\')>0||!hide0card">'
            +'            <div class="cpt_indent_1 cpt_row_app" v-on:click="switchDetailDisplay(app.id)">'
            +'                <a v-bind:href="app.url">{{ app["名称"] }}</a>'
            +'                <div>{{ app["卡牌数"] }}</div>'
            +'                <div>{{ app["普卡均价"] }}</div>'
            +'                <div>{{ app["普卡半套"] }}</div>'
            +'                <div>{{ app["普卡一套"] }}</div>'
            +'                <div>{{ app["闪卡均价"] }}</div>'
            +'                <div>{{ app["闪卡半套"] }}</div>'
            +'                <div>{{ app["闪卡一套"] }}</div>'
            +'                <div>{{ app["补充包"] }}</div>'
            +'            </div>'
            +'            <div v-show="app.market_items.length&&appids_detail.has(app.id)">'
            +'                <div class="cpt_indent_2 cpt_row_market">'
            +'                    <div>名称</div>'
            +'                    <div>最低出售</div>'
            +'                    <div>在售数量</div>'
            +'                </div>'
            +'                <div class="cpt_indent_2 cpt_row_market" v-for="item in app.market_items">'
            +'                    <a v-bind:href="item.url">{{ item["名称"] }}</a>'
            +'                    <div>{{ item["最低出售"] }}</div>'
            +'                    <div>{{ item["在售数量"] }}</div>'
            +'                </div>'
            +'            </div>'
            +'        </div>'
            +'        <div class="cpt_indent_1" style="text-align: end;" v-show="apps.length">*表示数据来自其乐SteamDB, 可能延迟于现实</div>'
            +'    </div>'
            +'</div>' + MAIN_POST.getElementsByClassName('plc')[0].innerHTML


        CPT_TABLE = new Vue({
            el: '#cpt_table',
            data: {
                apps: [],
                appids_detail: new Set(),
                hide0card: false
            },
            methods: {
                switchDetailDisplay: function(appid) {
                    if (this.appids_detail.has(appid))
                        this.appids_detail.delete(appid)
                    else
                        this.appids_detail.add(appid)
                }
            },
            computed: {
                apps_show :function () {
                    let show = []
                    for (let app of this.apps) 
                        // if (APPIDS.has(app.id))  // 是否只显示当前页面含有的app
                            // if (String(app['卡牌数']).replace('*','')>0||!this.hide0card) // 已移至html中的v-show中, 以便被收录到APPIDS中, 无论是否显示无卡
                                show.push(app)

                    for (let app of show) {
                        app.market_items.sort( (a,b) => {
                            let av=0,bv=0 // 0:普卡 1:闪卡 2:补充包
                            if (a.hash_name.includes('(Foil')) av = 1
                            else if (a.hash_name.includes('Booster Pack')) av = 2
                            if (b.hash_name.includes('(Foil')) bv = 1
                            else if (b.hash_name.includes('Booster Pack')) bv = 2
                            
                            if (av!==bv)
                                return av-bv
                            else
                                return a.hash_name<b.hash_name?(-1):(a.hash_name===b.hash_name?0:1) 
                        })
                    }
                    return show
                }
            }
        })

        CPT_PANEL = new Vue({
            el: '#cpt_panel',
            data: {
                startable: true,

                hide0card: false,

                requesting: 0,
                requests_fail: 0,
                appids_count: 0,
                kldb_queried: 0,
                card_apps: '?',
                steam_queried: 0,
            },
            methods:{
                clickStart: function () {
                    PAUSE_DATA_SPIDER = !PAUSE_DATA_SPIDER
                    this.startable = PAUSE_DATA_SPIDER
                },
                clickHide0Card: function () {
                    CPT_TABLE.hide0card = !CPT_TABLE.hide0card
                    this.hide0card = CPT_TABLE.hide0card
                }
            },
        })

    }, 500)

    setInterval(function () {
        // 更新数据

        if (CPT_PANEL===undefined||CPT_TABLE===undefined) return undefined

        CPT_PANEL.requesting = countRequesting()
        CPT_PANEL.requests_fail = REQUESTS_FAIL+'/'+RESPONSE_EXCEPTIONS
        CPT_PANEL.appids_count = APPIDS.size
        CPT_PANEL.kldb_queried = Object.keys(APPS).length
        CPT_PANEL.card_apps = CPT_PANEL.kldb_queried?APPIDS_CARDS.size:'?'
        CPT_PANEL.steam_queried = Object.keys(APPS_MARKET).length

        let apps = []
        Object.keys(APPS).forEach(function (appid) {
            let app = {
                'id': appid,
                'url': 'https://store.steampowered.com/app/'+appid,
                'market_items': [],

                '名称': APPS[appid].name,
                '卡牌数': APPS[appid].card===undefined?'0*':(APPS[appid].card.normal.count+'*'),
                '普卡均价': APPS[appid].card===undefined?0:(APPS[appid].card.normal.average+'*'),
                '普卡半套': 0,
                '普卡一套': 0,
                '闪卡均价': APPS[appid].card===undefined?0:(APPS[appid].card.foil.average+'*'),
                '闪卡半套': 0,
                '闪卡一套': 0,
                '补充包': APPS[appid].card===undefined?0:(APPS[appid].card.booster+'*'),
            }

            if (APPS_MARKET[appid]!==undefined) {
                app['卡牌数'] = 0
                for (let item of APPS_MARKET[appid]) {
                    let mi = {
                        'hash_name': item.hash_name,
                        'url': 'https://steamcommunity.com/market/listings/753/'+item.hash_name,

                        '名称': item.name,
                        '最低出售': item.sell_price_text,
                        '在售数量': item.sell_listings,
                    }
                    app.market_items.push(mi)

                    if (mi.hash_name.includes('(Foil')) {
                        app['闪卡一套'] += item.sell_price // 单位: 分
                    } else if (mi.hash_name.includes('Booster Pack')) {
                        app['补充包'] = item.sell_price/100 // 单位: 元
                    } else {
                        app['普卡一套'] += item.sell_price // 单位: 分
                        app['卡牌数'] += 1
                    }
                }

                app['普卡均价'] = Math.round(app['普卡一套']/app['卡牌数'])/100 // 单位为元, 精确到 0.01, 下同
                app['闪卡均价'] = Math.round(app['闪卡一套']/app['卡牌数'])/100
                
                app['普卡半套'] = Math.round(app['普卡一套']/app['卡牌数']*Math.ceil(app['卡牌数']/2))/100
                app['闪卡半套'] = Math.round(app['闪卡一套']/app['卡牌数']*Math.ceil(app['卡牌数']/2))/100
                
                app['普卡一套'] = app['普卡一套']/100 // 单位: 分 -> 元
                app['闪卡一套'] = app['闪卡一套']/100
            }
            
            apps.push(app)
        })
        CPT_TABLE.apps = apps
    }, 250)

    ////////////////////////////////////////////////////////////////////////////
})();