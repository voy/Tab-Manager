function match(str, search) {
    if (search.startsWith("/") && search.endsWith("/")) {
        var re = new RegExp(search.substr(1, search.length - 2), "i");
        return str.match(re) !== null;
    } else {
        return str.includes(search.toLowerCase());
    }
}

function isTabMatching(tab, search) {
    return match(tab.title, search) || match(tab.url, search);
}

var TabManager = React.createFactory(React.createClass({
	getInitialState:function(){
		this.update();
		return {
			layout:localStorage["layout"]||"horizontal",
			windows:[],
			selection:{},
			hiddenTabs:{},
			tabsbyid:{},
			windowsbyid:{},
			filterTabs:!!localStorage["filter-tabs"]
		}
	},
	render:function(){
		var self = this;
		return React.DOM.div({},
			this.state.windows.map(function(window){
				return Window({
					window:window,
					tabs:window.tabs,
					layout:self.state.layout,
					selection:self.state.selection,
					hiddenTabs:self.state.hiddenTabs,
					filterTabs:self.state.filterTabs,
					select:self.select.bind(self),
					drag:self.drag.bind(self),
					drop:self.drop.bind(self),
				})
			}),
			React.DOM.div({className:"window searchbox"},
				React.DOM.input({type:"text",onChange:this.search,onKeyDown:this.checkEnter,ref:"searchbox"}),
				React.DOM.div({className:"icon windowaction "+this.state.layout,title:"Change layout",onClick:this.changelayout}),
				React.DOM.div({className:"icon windowaction trash",title:"Delete Tabs",onClick:this.deleteTabs}),
				React.DOM.div({className:"icon windowaction pin",title:"Pin Tabs",onClick:this.pinTabs}),
				React.DOM.div({className:"icon windowaction filter"+(this.state.filterTabs? " enabled":""),
								title:(this.state.filterTabs? "Do not hide":"Hide")+" non-matching Tabs",onClick:this.toggleFilterMismatchedTabs}),
				React.DOM.div({className:"icon windowaction new",title:"Add Window",onClick:this.addWindow})
			),
			React.DOM.div({className:"window placeholder"})
		)
	},
	componentDidMount:function(){
		var box = this.refs.searchbox.getDOMNode();
		box.focus();
		box.select();
		chrome.windows.onCreated.addListener(this.update.bind(this))
		chrome.windows.onRemoved.addListener(this.update.bind(this))
		chrome.tabs.onCreated.addListener(this.update.bind(this))
		chrome.tabs.onUpdated.addListener(this.update.bind(this))
		chrome.tabs.onMoved.addListener(this.update.bind(this))
		chrome.tabs.onDetached.addListener(this.update.bind(this))
		chrome.tabs.onRemoved.addListener(this.update.bind(this))
		chrome.tabs.onReplaced.addListener(this.update.bind(this))
	},
	update:function(){
		chrome.windows.getAll({populate:true},windows => {
			this.state.windows = windows;
			this.state.windowsbyid = {};
			this.state.tabsbyid = {};
			for(var i = 0; i < windows.length; i++){
				var window = windows[i];
				this.state.windowsbyid[window.id] = window;
				for(var j = 0; j < window.tabs.length; j++){
					var tab = window.tabs[j];
					this.state.tabsbyid[tab.id] = tab;
				}
			}
			for(var id in this.state.selection){
				if(!this.state.tabsbyid[id]) delete this.state.selection[id];
			}

			this.forceUpdate();
		});
	},
	deleteTabs:function(){
		var self = this;
		var tabs = Object.keys(this.state.selection).map(function(id){return self.state.tabsbyid[id]});
		if(tabs.length){
			for(var i = 0; i < tabs.length; i++){
				chrome.tabs.remove(tabs[i].id);
			}
		}else{
			chrome.windows.getCurrent(function(w){
				chrome.tabs.getSelected(w.id,function(t){
					chrome.tabs.remove(t.id);
				});
			});
		}
	},
	addWindow:function(){
		var self = this;
		var tabs = Object.keys(this.state.selection).map(function(id){return self.state.tabsbyid[id]});
		var first = tabs.shift();
		var count = 0;
		if(first){
			chrome.windows.create({tabId:first.id},function(w){
				chrome.tabs.update(first.id,{pinned:first.pinned});
				for(var i = 0; i < tabs.length; i++){
					(function(tab){
						chrome.tabs.move(tab.id,{windowId:w.id,index:1},function(){
							chrome.tabs.update(tab.id,{pinned:tab.pinned});
						});
					})(tabs[i]);
				}
			});
		}else{
			chrome.windows.create({});
		}
	},
	pinTabs:function(){
		var self = this;
		var tabs = Object.keys(this.state.selection).map(function(id){return self.state.tabsbyid[id]}).sort(function(a,b){return a.index-b.index});
		if(tabs.length ){
			if(tabs[0].pinned) tabs.reverse();
			for(var i = 0; i < tabs.length; i++){
				chrome.tabs.update(tabs[i].id,{pinned:!tabs[0].pinned});
			}

		}else{
			chrome.windows.getCurrent(function(w){
				chrome.tabs.getSelected(w.id,function(t){
					chrome.tabs.update(t.id,{pinned:!t.pinned});
				});
			});
		}
	},
	search:function(e){
        var search = e.target.value;

        var tabs = Object.keys(this.state.tabsbyid).map(id => this.state.tabsbyid[id]);

        var result = tabs.reduce((acc, tab) => {
            if (isTabMatching(tab, search)) {
                acc.selection[tab.id] = true;
            } else {
                acc.hiddenTabs[tab.id] = true;
            }

            return acc;
        }, { selection: {}, hiddenTabs: {} });

        this.state.selection = result.selection;
        this.state.hiddenTabs = result.hiddenTabs;

		this.forceUpdate();
	},
	checkEnter:function(e){
		if(e.keyCode == 13) this.addWindow();
	},
	changelayout:function(){
		if(this.state.layout == "blocks"){
			localStorage["layout"] = this.state.layout = "horizontal";
		}else if(this.state.layout == "horizontal"){
			localStorage["layout"] = this.state.layout = "vertical";
		}else{
			localStorage["layout"] = this.state.layout = "blocks";
		}
		this.forceUpdate();
	},
	select:function(id){
		if(this.state.selection[id]){
			delete this.state.selection[id];
		}else{
			this.state.selection[id] = true;
		}
		this.forceUpdate();
	},
	drag:function(e,id){
		if(!this.state.selection[id]){
			this.state.selection = {};
			this.state.selection[id] = true;
		}
		this.forceUpdate();
	},
	drop:function(id,before){
		var self = this;
		var tab = this.state.tabsbyid[id];
		var tabs = Object.keys(this.state.selection).map(function(id){return self.state.tabsbyid[id]});
		var index = tab.index+(before?0:1);

		for(var i = 0; i < tabs.length; i++){
			(function(t){
				chrome.tabs.move(t.id,{windowId:tab.windowId,index:index},function(){
					chrome.tabs.update(t.id,{pinned:t.pinned});
				});
			})(tabs[i]);
		}
	},
	toggleFilterMismatchedTabs:function(){
		this.state.filterTabs = !this.state.filterTabs;
		localStorage["filter-tabs"] = this.state.filterTabs? 1 : ""
		this.forceUpdate();
	}
}));
