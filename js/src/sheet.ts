import * as widgets  from '@jupyter-widgets/base';
import {cloneDeep, extend, includes as contains, each, debounce, times, map, unzip as transpose} from 'lodash';
import * as pkg from '../package.json';
// @ts-ignore
import * as Handsontable from 'handsontable';

import 'pikaday/css/pikaday.css';
import 'handsontable/dist/handsontable.min.css';
import '../../src/custom.css';

let semver_range = '~' + pkg.version;


let CellRangeModel = widgets.WidgetModel.extend({
    defaults: function() {
        return extend(CellRangeModel.__super__.defaults.call(this), {
            _model_name : 'CellRangeModel',
            _model_module : 'ipysheet',
            _model_module_version : semver_range,
            value : null,
            row_start: 1,
            column_start: 1,
            row_end: 1,
            column_end: 1,
            type: null, //'text',
            name: null,
            style: {},
            renderer: null,
            read_only: false,
            choice: null,
            squeeze_row: true,
            squeeze_column: true,
            transpose: false,
            numeric_format: '0.[000]',
            date_format: 'YYYY/MM/DD'
        });
    },
});


let SheetModel = widgets.DOMWidgetModel.extend({
    defaults: function() {
        return extend(SheetModel.__super__.defaults.call(this), {
            _model_name : 'SheetModel',
            _view_name : 'SheetView',
            _model_module : 'ipysheet',
            _view_module : 'ipysheet',
            _model_module_version : semver_range,
            _view_module_version : semver_range,
            rows: 3,
            columns: 4,
            data: [[]],
            cells: [],
            named_cells: {},
            row_headers: true,
            column_headers: true,
            stretch_headers: 'all',
            column_width: null,
        });
    },
    initialize : function () {
        SheetModel.__super__.initialize.apply(this, arguments);
        this.update_data_grid();
        this._updating_grid = false;
        this.on('change:rows change:columns', this.update_data_grid, this);
        this.on('change:cells', this.on_change_cells, this);
        this.on('change:data', this.grid_to_cell, this);
        each(this.get('cells'), (cell) => this.cell_bind(cell))
        this.cells_to_grid()
    },
    on_change_cells: function() {
        this._updating_grid = true;
        try {
            let previous_cells = this.previous('cells');
            let cells = this.get('cells');
            for(let i = 0; i < cells.length; i++) {
                let cell = cells[i];
                if(!contains(previous_cells, cell)) {
                    this.cell_bind(cell);
                }
            }
            this.cells_to_grid()
            //this.save_changes();
        } finally {
            this._updating_grid = false;
        }
        this.grid_to_cell()
    },
    cell_bind: function(cell) {
        cell.on('change:value change:style change:type change:renderer change:read_only change:choice change:numeric_format change:date_format', function() {
            this.cells_to_grid()
        }, this);
    },
    cells_to_grid: function() {
        let data = this.get('data');
        each(this.get('cells'), (cell) => {
            this._cell_data_to_grid(cell, data)
        });
        this.set_data(data);
    },
    _cell_data_to_grid: function(cell, data) {
        let value = cell.get('value');
        if((value === null) || (value === undefined)) {
            return;
        }
        for(let i = cell.get('row_start'); i <= cell.get('row_end'); i++) {
            for(let j = cell.get('column_start'); j <= cell.get('column_end'); j++) {
                let value = cell.get('value');
                let cell_row = i - cell.get('row_start');
                let cell_col = j - cell.get('column_start');
                if((i >= data.length) || (j >= data[i].length))
                    continue; // skip cells that are out of the sheet
                let cell_data = data[i][j];
                if(cell.get('transpose')) {
                    if(!cell.get('squeeze_column'))
                        value = value[cell_col]
                    if(!cell.get('squeeze_row'))
                        value = value[cell_row]
                } else {
                    if(!cell.get('squeeze_row'))
                        value = value[cell_row]
                    if(!cell.get('squeeze_column'))
                        value = value[cell_col]
                }
                if(value != null)
                    cell_data.value = value;
                cell_data.options['type'] = cell.get('type') || cell_data.options['type'];
                cell_data.options['style'] = extend({}, cell_data.options['style'], cell.get('style'));
                cell_data.options['renderer'] = cell.get('renderer') || cell_data.options['renderer'];
                cell_data.options['readOnly'] = cell.get('read_only') || cell_data.options['readOnly'];
                cell_data.options['source'] = cell.get('choice') || cell_data.options['source'];
                if (cell.get('numeric_format') && cell.get('type') == 'numeric') {
                    cell_data.options['numericFormat'] = {'pattern': cell.get('numeric_format')};
                }
                if (cell.get('date_format') && cell.get('type') == 'date') {
                    cell_data.options['correctFormat'] = true;
                    cell_data.options['dateFormat'] = cell.get('date_format') || cell_data.options['dateFormat'];
                }
            }
        }
    },

    grid_to_cell: function() {
        if(this._updating_grid) {
            return;
        }
        this._updating_grid = true;
        try {
            let data = this.get('data');
            each(this.get('cells'), function(cell) {
                let rows = [];
                for(let i = cell.get('row_start'); i <= cell.get('row_end'); i++) {
                    let row = [];
                    for(let j = cell.get('column_start'); j <= cell.get('column_end'); j++) {
                        //let cell_row = i - cell.get('row_start');
                        //let cell_col = j - cell.get('column_start');
                        if((i >= data.length) || (j >= data[i].length))
                            continue; // skip cells that are out of the sheet
                        let cell_data = data[i][j];
                        row.push(cell_data.value)
                        /*cell.set('value', cell_data.value);
                        cell.set('type', cell_data.options['type']);
                        cell.set('style', cell_data.options['style']);
                        cell.set('renderer', cell_data.options['renderer']);
                        cell.set('read_only', cell_data.options['readOnly']);
                        cell.set('choice', cell_data.options['source']);
                        cell.set('format', cell_data.options['format']);*/
                    }
                    if(cell.get('squeeze_column')) {
                        row = row[0];
                    }
                    rows.push(row);
                }
                if(cell.get('squeeze_row')) {
                    rows = rows[0];
                }
                if(cell.get('transpose')) {
                    cell.set('value', transpose(rows))
                } else {
                    cell.set('value', rows)
                }
                cell.save_changes();
            });
        } finally {
            this._updating_grid = false;
        }
    },
    update_data_grid: function() {
        // create a row x column array of arrays filled with null
        let data = this.get('data');
        let rows = this.get('rows');
        let columns = this.get('columns');

        let empty_cell = () => {
            return {value: null, options:{}};
        };
        let empty_row = () => {
            return times(this.get('columns'), empty_cell);
        };
        if(rows < data.length) {
            data = data.slice(0, rows);
        } else if(rows > data.length) {
            for(let i = data.length; i < rows; i++) {
                data.push(empty_row());
            }
        }
        for(let i = 0; i < rows; i++) {
            let row = data[i];
            if(columns < row.length) {
                row = row.slice(0, columns);
            } else if(columns > row.length) {
                for(let j = row.length; j < columns; j++) {
                    row.push(empty_cell());
                }
            }
            data[i] = row;
        }
        this.set_data(data);
    },
    set_data: function(new_value) {
        this.set('data', new_value);

        // Workaround for:
        // - sending the changes to Python
        // - triggering the change event
        // This workaround is faster than making a deep copy of data
        this.sync("update", this);
        this.trigger("change:data");
    }
}, {
    serializers: extend({
        cells: { deserialize: widgets.unpack_models }
    }, widgets.DOMWidgetModel.serializers)
});

// go from 2d array with objects to a 2d grid containing just attribute `attr` from those objects
let extract2d = function(grid, attr) {
    return map(grid, function(column) {
        return map(column, function(value) {
            return value[attr];
        });
    });
};

// inverse of above
let put_values2d = function(grid, values) {
    // TODO: the Math.min should not be needed, happens with the custom-build
    for(let i = 0; i < Math.min(grid.length, values.length); i++) {
        for(let j = 0; j < Math.min(grid[i].length, values[i].length); j++) {
            grid[i][j].value = values[i][j];
        }
    }
};

// calls the original renderer and then applies custom styling
Handsontable.renderers.registerRenderer('styled', function customRenderer(hotInstance, td, row, column, prop, value, cellProperties) {
    let name = cellProperties.original_renderer || cellProperties.type || 'text';
    let original_renderer = Handsontable.renderers.getRenderer(name);
    original_renderer.apply(this, arguments);
    each(cellProperties.style, function(value, key) {
        td.style[key] = value;
    });
});

let SheetView = widgets.DOMWidgetView.extend({
    render: function() {
        this.displayed.then(() => {
            this._build_table().then((hot) => {
                this.hot = hot;
                this.model.on('change:data', this.on_data_change, this);
                this.model.on('change:column_headers change:row_headers', this._update_hot_settings, this);
                this.model.on('change:stretch_headers change:column_width', this._update_hot_settings, this);
            });
        });
    },
    processPhosphorMessage: function(msg) {
        SheetView.__super__.processPhosphorMessage.apply(this, arguments);
        switch (msg.type) {
        case 'resize':
        case 'after-show':
            this.table_render();
            break;
        }
    },
    _build_table() {
        return Promise.resolve(new Handsontable(this.el, extend({
            data: this._get_cell_data(),
            rowHeaders: true,
            colHeaders: true,
            cells: (...args) => this._cell(...args),
            afterChange: (changes, source) => { this._on_change(changes, source); },
            afterRemoveCol: (changes, source) => { this._on_change_grid(changes, source); },
            afterRemoveRow: (changes, source) => { this._on_change_grid(changes, source); }
        }, this._hot_settings())));
    },
    _update_hot_settings: function() {
        this.hot.updateSettings(this._hot_settings());
    },
    _hot_settings: function() {
        return {
            colHeaders: this.model.get('column_headers'),
            rowHeaders: this.model.get('row_headers'),
            stretchH: this.model.get('stretch_headers'),
            colWidths: this.model.get('column_width') || undefined
        };
    },
    _get_cell_data: function() {
        return extract2d(this.model.get('data'), 'value');
    },
    _cell: function(row, col) {
        let data = this.model.get('data');
        let cellProperties = cloneDeep(data[row][col].options);
        if(!((row < data.length) && (col < data[row].length))) {
            console.error('cell out of range');
        }
        if(cellProperties['type'] == null)
            delete cellProperties['type'];
        if(cellProperties['style'] == null)
            delete cellProperties['style'];
        if(cellProperties['source'] == null)
            delete cellProperties['source'];
        if('renderer' in cellProperties)
            cellProperties.original_renderer = cellProperties['renderer'];
        cellProperties.renderer = 'styled';
        return cellProperties;
    },
    _on_change_grid: function(changes, source) {
        let data = this.hot.getSourceDataArray();
        this.model.set({'rows': data.length, 'columns': data[0].length});
        this.model.save_changes();
    },
    _on_change: function(changes, source) {
        if(this.hot === undefined || source == 'loadData') {
            return;
        }
        if(source == 'alter') {
            let data = this.hot.getSourceDataArray();
            this.model.set({'rows': data.length, 'columns': data[0].length});
            this.model.save_changes();
            return;
        }
        //this.hot.validateCells()
        //*
        //this.hot.validateCells(_.bind(function(valid){
        //    console.log('valid?', valid)
        //    if(valid) {
        let data = this.model.get('data');
        let value_data = this.hot.getSourceDataArray();
        put_values2d(data, value_data);
        this.model.set_data(data);
        //    }
        //}, this))
        /**/
    },
    on_data_change: function() {
        let data = extract2d(this.model.get('data'), 'value');
        let rows = data.length;
        let cols = data[0].length;
        let rows_previous = this.hot.countRows();
        let cols_previous = this.hot.countCols();
        //*
        if(rows > rows_previous) {
            this.hot.alter('insert_row', rows-1, rows-rows_previous);
        }
        if(rows < this.hot.countRows()) {
            this.hot.alter('remove_row', rows-1, rows_previous-rows);
        }
        if(cols > cols_previous) {
            this.hot.alter('insert_col', cols-1, cols-cols_previous);
        }
        if(cols < cols_previous) {
            this.hot.alter('remove_col', cols-1, cols_previous-cols);
        }/**/

        this.hot.loadData(data);
        // if headers are not shows, loadData will make them show again, toggling
        // will fix this (handsontable bug?)
        this.hot.updateSettings({colHeaders: true, rowHeaders: true});
        this.hot.updateSettings({
            colHeaders: this.model.get('column_headers'),
            rowHeaders: this.model.get('row_headers')
        });
        this.table_render();
    },
    set_cell: function(row, column, value) {
        this.hot.setDataAtCell(row, column, value);
    },
    get_cell: function(row, column) {
        return this.hot.getDataAtCell(row, column);
    },
    table_render: function() {
        this.hot.render();
    }
});



export {
    SheetModel,
    SheetView,
    CellRangeModel,
    Handsontable
};
