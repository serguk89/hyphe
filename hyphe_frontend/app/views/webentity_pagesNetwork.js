'use strict';

angular.module('hyphe.webentityPagesNetworkController', [])

  .controller('webentityPagesNetwork',
  function($scope,
    api,
    utils,
    corpus,
    $window,
    $mdSidenav
  ) {
    $scope.corpusName = corpus.getName()
    $scope.corpusId = corpus.getId()

    $scope.webentity = {id:utils.readWebentityIdFromRoute(), loading:true}
    $scope.pages
    $scope.loading = true

    $scope.includeExternalLinks = false
    $scope.network
    $scope.nodeColorMap
    $scope.nodeSizeMap
    $scope.nodeSizeBaseRatio = 0.5

    $scope.toggleSidenav = function() {
      $mdSidenav('right').toggle()
    }

    $scope.downloadNetwork = function() {
      if ($scope.network) {
        var blob = new Blob([gexf.write($scope.network)], {'type':'text/gexf+xml;charset=utf-8'});
        saveAs(blob, $scope.corpusName + ".gexf", true);
      }
    }

    $scope.$watch('nodeSizeBaseRatio', updateNetwork)

    // Init
    api.downloadCorpusTLDs(function(){
      fetchWebentity(utils.readWebentityIdFromRoute())
    })

    // Functions
    function fetchWebentity(id){
      $scope.status = {message: 'Loading web entity'}
      api.getWebentities({
          id_list:[id]
          ,crawledOnly: false
        }
        ,function(result){
          $scope.webentity = result[0]
          loadPages()
        }
        ,function(){
          $scope.status = {message: 'Error loading web entity', background: 'danger'}
        }
      )
    }

    function loadPages(){
      $scope.status = {message: 'Loading pages'}
      api.getPages({
          webentityId:$scope.webentity.id
        }
        ,function(result){
          $scope.pages = result
          loadNetwork()
        }
        ,function(){
          $scope.status = {message: 'Error loading pages', background: 'danger'}
        }
      )
    }

    function loadNetwork(){
      $scope.status = {message: 'Loading links'}
      api.getPagesNetwork({
          webentityId: $scope.webentity.id
          ,includeExternalLinks: $scope.includeExternalLinks
        }
        ,function(result){
          $scope.status = {}
          $scope.webentity.loading = false

          buildNetwork(result)
        }
        ,function(){
          $scope.status = {message: 'Error loading web entity', background: 'danger'}
        }
      )
    }

    function updateNetwork() {
      var g = $scope.network
      if (g === undefined) { return }

      // Color
      var colors = {
        crawled: '#333',
        uncrawled: '#93BDE0',
        startpage: '#F00'
      }
      var counts = {
        crawled: 0,
        uncrawled: 0,
        startpage: 0
      }
      g.nodes().forEach(function(nid){
        var n = g.getNodeAttributes(nid)
        if (n.startPage) {
          n.color = colors.startpage
          counts.startpage++
        } else if (n.crawled) {
          n.color = colors.crawled
          counts.crawled++
        } else {
          n.color = colors.uncrawled
          counts.uncrawled++
        }
      })
      $scope.nodeColorMap = [
        {name: 'Start Pages', color: colors.startpage, count: counts.startpage},
        {name: 'Crawled Pages', color: colors.crawled, count: counts.crawled},
        {name: 'Uncrawled Pages', color: colors.uncrawled, count: counts.uncrawled}
      ]

      // Size
      var minSize = 1
      var values = []
      g.nodes().forEach(function(nid){
        var value = g.degree(nid)
        var size = $scope.nodeSizeBaseRatio * (minSize + Math.sqrt(g.degree(nid)))
        values.push(value)
        g.setNodeAttribute(nid, 'size', size)
      })

      $scope.nodeSizeMap = [
        {size: 0.5, name: 'Smallest node', value: d3.min(values)},
        {size: 1.2, name: 'Biggest node', value: d3.max(values)}
      ]
    }

    function buildNetwork(json){
      var nIndex = {}
      json.forEach(function(d){
        nIndex[d[0]] = true
        nIndex[d[1]] = true
      })

      var startPagesIndex = {}
      $scope.webentity.startpages.forEach(function(url){
        startPagesIndex[url] = true
      })

      var crawledIndex = {}
      $scope.pages.forEach(function(page){
        crawledIndex[page.lru] = page.crawled
      })

      var lru
      for (lru in nIndex) {
        var url = utils.LRU_to_URL(lru)
        nIndex[lru] = {
          lru: lru,
          url: url,
          name: url,
          crawled: !!crawledIndex[lru],
          startPage: !!startPagesIndex[url]
        }
      }

      var linksIdIndex = {}
      var links = json.map(function(d){
        return {
          key: d[0] + '>' + d[1],
          source: d[0],
          target: d[1],
          attributes: {count:d[2]}
        }
      }).filter(function(l){
        if (linksIdIndex[l.key]) {
          return false
        }
        linksIdIndex[l.key] = true
        return l.source != l.target
      })

      var g = new Graph({type: 'directed', allowSelfLoops: false})
      g.addNodesFrom(nIndex)
      g.importEdges(links)

      // Default appearance
      g.nodes().forEach(function(nid){
        var n = g.getNodeAttributes(nid)
        n.color = '#999'
        n.size = 1
      })

      // Init Label and coordinates
      var nodesArea = g.order * 10
      g.nodes().forEach(function(nid){
        var n = g.getNodeAttributes(nid)
        var xy = generateRandomCoordinates(nodesArea)
        n.x = xy.x
        n.y = xy.y
        n.label = n.name
      })

      // Default color for edges
      g.edges().forEach(function(eid){
        var e = g.getEdgeAttributes(eid)
        e.color = '#DDD'
      })

      // Make the graph global for console tinkering
      window.g = g

      $scope.network = g

      updateNetwork()

      $scope.loading = false
    }

    function generateRandomCoordinates(area) {
      var d = Infinity
      var r = Math.sqrt(area / Math.PI || 1)
      var x, y
      while (d>r) {
        x = (0.5 - Math.random()) * 2 * r
        y = (0.5 - Math.random()) * 2 * r
        d = Math.sqrt(x*x + y*y)
      }
      return {x:x, y:y}
    }

  })
