// ==UserScript==
// @name         Keylol_主楼游戏卡价表
// @version      2020.3.4
// @description  计算主楼游戏的卡牌价格
// @author       CYTMWIA
// @match        http*://keylol.com/t*
// @match        http*://keylol.com/forum.php?*mod=viewthread*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    let REQUESTING = 0 //记录当前存活请求数
    function request(kwargs={}) {
        REQUESTING+=1

        let _kwargs = {
            method:"GET",
            timeout:3000,
            onabort: ()=>{REQUESTING-=1},
            onerror: ()=>{REQUESTING-=1},
            ontimeout: ()=>{REQUESTING-=1},
            onload: ()=>{REQUESTING-=1},
        }
        for (let [key,val] of Object.entries(kwargs)) {
            if (["onabort","onerror","ontimeout","onload"].includes(key)) {
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

    // 主楼及帖子信息
    let MAIN_POST = document.getElementById("postlist").children[1]
    let PID = MAIN_POST.id.substring(5)
    let TID = document.getElementById("thread_subject").href
    TID = TID.substring(TID.lastIndexOf("/")+2,TID.indexOf("-"))

    let APPIDS = []
    function addAppid(appid) {
        if (!APPIDS.includes(appid))
            APPIDS.push(appid)
    }
    function addAppidFromLink (link) {
        let appid = link.split("/")[4]
        addAppid(appid)
    }
    function addAppidsFromElement (ele) {
        let links = ele.getElementsByClassName("steam-info-link")
        for (let i=0;i<links.length;i+=1) {
            addAppidFromLink(links[i].href)
        }
    }
    function addAppidsFromString(s) {
        let links = s.match(/https:\/\/store\.steampowered\.com\/app\/\d+\//g)
        for (let link of links) {
            addAppidFromLink(link)
        }
    }

    addAppidsFromElement(MAIN_POST)

    let threadindex = document.getElementById("threadindex") //目录
    if (threadindex != null) {
        let max = threadindex.getElementsByTagName("li").length
        if (max>=2) {
            for (let i=2;i<=max;i+=1) {
                request({
                    method:"GET",
                    url:"https://keylol.com/forum.php?mod=viewthread&threadindex=yes&tid="+TID+"&viewpid="+PID+"&cp="+i,
                    onload:(response) => {
                        addAppidsFromString(response.responseText)
                    }
                })
            }
        }
    }


    if (APPIDS.length==0) {
        return; // 无商店链接
    }

    // UI sytle
    document.head.innerHTML+= ""
        +"<style>"
        +".price_table {"
        +"    border-width: thin;"
        +"    border-color: grey;"
        +"}"
        +".grid_close {"
        +"    border-style: solid;"
        +"}"
        +".trow_mid {"
        +"    border-style: none solid;"
        +"}"
        +".trow_end {"
        +"    border-style: solid none solid solid;"
        +"}"
        +".text_block {"
        +"    border-style: none;"
        +"    background-color: rgb(87, 186, 232);"
        +"    color: white;"
        +"}"
        +".text_block_grey {"
        +"    border-style: none;"
        +"    background-color: grey;"
        +"    color: lightgray;"
        +"}"
        +".cal_btn {"
        +"    position: relative;"
        +"    top: 1.5ex;"
        +"    left: 10px;"
        +"}"
        +"</style>"

    // 添加UI
    let PRICE_TABLE, CAL_BTN
    function addTable() {
        MAIN_POST.getElementsByClassName("plc")[0].innerHTML = ""
            +'<br>'
            +'<div class="t_fsz" style="background-color: rgb(229, 237, 242);">'
            +'    <div class="text_block">卡牌价格表</div>'
            +'    <button id="cal_btn" class="text_block_grey cal_btn">生成表格</button>'
            +'    <br><br>'
            +'    <table id="price_table" class="price_table" style="border-style: solid;">'
            +'    </table>'
            +'</div>'
            + MAIN_POST.getElementsByClassName("plc")[0].innerHTML

        PRICE_TABLE = document.getElementById("price_table")
        CAL_BTN = document.getElementById("cal_btn")
    }

    function addRow(lst,classname="grid_close") {
        if (lst==null)
            return;

        let row = "<tr>"
        for (let i=0;i<lst.length;i+=1)
            row+="<td class=\"price_table "+classname+"\">"+lst[i]+"</td>"
        row += "</tr>"
        PRICE_TABLE.innerHTML+=row
    }

    function clearTable() {
        PRICE_TABLE.innerHTML=""
    }

    function round2(num) {
        return Math.round(num*100)/100
    }

    function sumArray(a) {
        return a.reduce((acc,cur)=>{
            return acc+cur
        })
    }

    function averageArray(a) {
        return sumArray(a)/a.length
    }

    function makeTable(headrow,columns,endrow) {
        // headrow = ["列1行1","列2行1","列3行1"...]
        /* 
        columns = [
            [列1行2,行3,行4...行n-1],
            [列2行2,行3,行4...行n-1],
            [列3行2,行3,行4...行n-1],
            ...
        ]
        */
        // endrow = ["列1行n","{sum}","列3行n"...]
        // {sum} : 该列总和

        clearTable()

        addRow(headrow)

        if (columns.length!=0) {
            for (let i=0;i<columns[0].length;i+=1) {
                let row = []
                for (let j=0;j<headrow.length;j+=1) {
                    row.push(columns[j][i])
                }
                addRow(row)
            }
            endrow.forEach((value,idx)=>{
                if (value=="{sum}") {
                    endrow[idx] = sumArray(columns[idx])
                    endrow[idx] = round2(endrow[idx])
                }
            })
        }

        addRow(endrow)
    }

    let APPINFO_KLDB = {} // 数据来自 steamdb.keylol.com , 卡牌价格数据与现实数据有延迟, 
    function getAppInfo(appid,callback) {
        if (APPINFO_KLDB[appid] != undefined) {
            callback()
        } else {
            request({
                method: "GET",
                url: "https://steamdb.keylol.com/app/"+appid+"/data.js?v=38",
                onload: function (response) {
                    if (response.status === 200) {
                        let text = response.responseText
                        APPINFO_KLDB[appid] = JSON.parse(text.substring(5,text.lastIndexOf(")")))
                    } else {
                        console.log("从 steamdb.keylol.com 查询 "+appid+" 失败")
                        console.log(response)
                    }
                    callback()
                }
            })
        }
    }

    let CARDINFO_ST = {} // 卡牌价格数据额外从steam市场获取
    function getCardInfo(appid,callback) {
        if (CARDINFO_ST[appid] != undefined) {
            callback()
        } else {
            request({
                method: "GET",
                url: "https://steamcommunity.com/market/search/render/?start=0&count=32&appid=753&category_753_Game[]=tag_app_"+appid+"&category_753_cardborder[]=tag_cardborder_0&category_753_item_class[]=tag_item_class_2&norender=1",
                timeout: 8000,
                onload: function (response) {
                    if (response.status === 200) {
                        let json = JSON.parse(response.responseText)
                        if (json["success"]==true) {
                            CARDINFO_ST[appid] = {
                                "raw_data": json,
                                "normal": {
                                    "count": json["total_count"],
                                    "average": 0
                                },
                                "foil": {},
                            }
                            if (json["total_count"]!=0) {
                                CARDINFO_ST[appid]["normal"]["average"] = json["results"].reduce((v1,v2)=>{
                                    return v1+v2["sell_price"]
                                },0) / json["total_count"] / 100

                                if (CARDINFO_ST["currency"]==undefined)
                                    CARDINFO_ST["currency"] = json["results"][0]["sell_price_text"].replace(/\d+\.*\d*/,"").trim()
                            }
                        }
                    }
                    if (CARDINFO_ST[appid]==undefined) {
                        console.log("从 steam市场 搜索 "+appid+" 失败")
                        console.log(response)
                    }

                    callback()
                }
            })
        }
    }

    function onclick_CAL_BTN() {
        if (REQUESTING<=0)
            APPIDS.forEach((appid,index)=>{
                getAppInfo(appid,()=>{
                    getCardInfo(appid, ()=>{

                        let columns = [[],[],[],[],[],[],[]]
                        for (let i=0;i<=APPIDS.length;i+=1) {
                            let appinfo = APPINFO_KLDB[APPIDS[i]]
                            let cardinfo = CARDINFO_ST[APPIDS[i]]
                            if (appinfo==undefined||cardinfo==undefined)
                                continue

                            columns[0].push(APPIDS[i])
                            columns[1].push(appinfo["name"])
                            if (cardinfo["normal"]["count"]!=0){
                                columns[2].push(appinfo["card"]["normal"]["count"])
                                columns[3].push(round2(cardinfo["normal"]["average"]))
                                columns[4].push(round2(Math.ceil(cardinfo["normal"]["count"]/2)*cardinfo["normal"]["average"]))
                                columns[5].push(round2(cardinfo["normal"]["count"]*cardinfo["normal"]["average"]))

                                if (cardinfo["normal"]["count"] != appinfo["card"]["normal"]["count"]) {
                                    columns[6].push("其乐数据库与steam市场卡牌数量不一致")
                                } else {
                                    columns[6].push("")
                                }
                            } else {
                                for (let j=2;j<6;j+=1)
                                    columns[j].push(0)
                                columns[6].push("")
                            }
                        }

                        let symbol = CARDINFO_ST["currency"]
                        makeTable(
                            ["appid","名称","普卡数","普卡均价("+symbol+")","普卡半套("+symbol+")","普卡一套("+symbol+")","备注"],
                            columns,
                            ["总和","","{sum}","","{sum}","{sum}",""]
                        )
                    })
                })
            })
    }

    setInterval(()=>{
        if (document.getElementById("price_table")==null){
            addTable()
            CAL_BTN.addEventListener("click",onclick_CAL_BTN)
        }

        if (REQUESTING) {
            CAL_BTN.className = "text_block_grey cal_btn"
        } else {
            CAL_BTN.className = "text_block cal_btn"
        }
    },250)

})();