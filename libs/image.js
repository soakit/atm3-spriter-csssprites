/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';
var Image = require('images'),
    path = require('path');

var RET_LINE_REG = /\r\n\s*/g;

module.exports = function (file, index, list, images, ret, settings, opt) {
    var gen = new Generator(file, index, list, images, ret, settings, opt);
    return gen.css;
};

function Generator(file, index, list, images, ret, settings, opt) {
    var self = this;
    var missSpriteName = fis.util.every(list, function (item) {
        return !item._sprite_name;
    });
    if (missSpriteName) {
        this._process(file, index, list, images, ret, settings, opt);
    } else {
        var spriteNameGrp = fis.util.groupBy(list, function (item) {
            return !!item._sprite_name ? item._sprite_name : 'NULL';
        });
        fis.util.each(spriteNameGrp, function (imageList, spriteName) {
            self._process(file, spriteName, imageList, images, ret, settings, opt);
        })
    }
}

Generator.prototype = {
    _process: function (file, index, list, images, ret, settings, opt) {
        var default_settings = {
            'margin': 3,
            'width_limit': 10240,
            'height_limit': 10240,
            'layout': 'linear',
            'ie_bug_fix': true
        };

        fis.util.map(default_settings, function (key, value) {
            if (settings.hasOwnProperty(key)) {
                if ((typeof value) == 'number') {
                    settings[key] = parseFloat(settings[key]);
                }
            } else {
                settings[key] = value;
            }
        });

        //如果layout不支持的类型，默认为linear
        var layouts = ['matrix', 'linear'];
        if (layouts.indexOf(settings.layout) == -1) {
            settings.layout = 'linear';
        }

        //设置宽高限制
        Image.setLimit(settings.width_limit, settings.height_limit);
        var that = this;
        this.file = file;
        this.ret = ret;
        this.settings = settings;
        this.opt = opt;
        this.css = this.css || '';
        this.images = images;
        this.index = index;

        var list_ = {};
        var scales = {};

        function getImage(release) {
            if (that.images.hasOwnProperty(release)) {
                return that.images[release];
            }
            return false;
        }

        function insertToObject(o, key, elm) {
            if (o[key]) {
                o[key].push(elm);
            } else {
                o[key] = [elm];
            }
        }

        fis.util.map(list, function (k, bg) {
            var image_ = Image(getImage(bg.getImageUrl()).getContent());
            var direct = bg.getDirect();

            bg.image_ = image_;

            var scale_ = bg.size[0] / image_.size().width;

            if (bg.size[0] != -1 && scale_ != settings.scale) {
                scale_ = '' + scale_;
                //不支持x, y
                if (direct === 'z') {
                    if (scales[scale_]) {
                        insertToObject(scales[scale_], direct, bg);
                    } else {
                        scales[scale_] = {};
                        insertToObject(scales[scale_], direct, bg);
                    }
                }
            } else {
                insertToObject(list_, direct, bg);
            }
        });

        this.fill(list_['x'], 'x', index);
        this.fill(list_['y'], 'y', index);
        this.zFill(list_['z'], settings.scale, index);
        //background-size
        fis.util.map(scales, function (s, l) {
            s = parseFloat(s);
            that.zFill(l['z'], s, index);
        });
    },
    _imageExist: function (images, url) {
        for (var i = 0, len = images.length; i < len; i++) {
            if (url == images[i].url) {
                return i;
            }
        }
        return false;
    },
    after: function (image, arr_selector, direct, scale, spriteName) {
        var ext = '_' + direct + '.png';
        var size = image.size();
        // FIXME allanyu
        //if (this.index) {
        //    ext = '_' + this.index + ext;
        //}

        if (scale) {
            ext = '_' + scale + ext;
        }
        var image_file;
        if (this.file.spriteRelease) {
            var imagePath = fis.project.getProjectPath() + this.file.spriteRelease;
            if (spriteName && spriteName !== 'NULL') {
                imagePath = path.dirname(imagePath) + "/" + spriteName;
            }
            image_file = fis.file.wrap(imagePath);
            image_file.setContent(image.encode('png'));
            fis.compile(image_file);
            this.ret.pkg[image_file.release] = image_file;
        } else {
            var image_file_path = fis.project.getProjectPath() + '/img/' + this.file.filename + ext;
            image_file = fis.file.wrap(image_file_path);
            image_file.setContent(image.encode('png'));
            fis.compile(image_file);
            this.ret.pkg['/img/' + this.file.filename + ext] = image_file;
        }

        function unique(arr) {
            var map = {};
            return arr.filter(function (item) {
                return map.hasOwnProperty(item) ? false : map[item] = true;
            });
        }

        function hasUsedRelativeHook() {
            var hooks = fis.get("modules.hook");
            return hooks.some(function (hook) {
                if (typeof hook === "object" && hook.__name === 'relative') {
                    return true;
                }
            });
        }

        var spriteUrl = image_file.getUrl(this.opt.hash, this.opt.domain) + image_file.hash;
        var _tmp_css = null;
        if (hasUsedRelativeHook() && !(image_file.useDomain && image_file.domain)) {
            spriteUrl = path.relative(this.file.subdirname, spriteUrl).replace(/[\/\\]+/g, '/');
        }

        if (this.settings.ie_bug_fix) {
            var MAX = this.settings.max_selectores || 30; //max 36
            var arr_selector = unique(arr_selector.join(',').split(','));
            var len = arr_selector.length;
            var n = Math.ceil(len / MAX);

            for (var i = 0; i < n; i++) {
                var step = i * MAX
                _tmp_css = "\r\n" + arr_selector.slice(step, step + MAX).join(',') + '{'
                    + (scale ? '\r\n    background-size: ' + this.px2rem(size.width * scale + "px ") + this.px2rem(size.height * scale + "px") + ';' : '')
                    + '\r\n    background-image: url(' + spriteUrl + ')\r\n}';
                if (this.file.optimizer)
                    _tmp_css = _tmp_css.replace(RET_LINE_REG, "");
                this.css += _tmp_css;
            }
        } else {
            _tmp_css = "\r\n" + unique(arr_selector.join(',').split(',')).join(',') + '{'
                + (scale ? '\r\n    background-size: ' + this.px2rem(size.width * scale + "px ") + this.px2rem(size.height * scale + "px") + ';' : '')
                + '\r\n    background-image: url(' + spriteUrl + ')\r\n}'
            if (this.file.optimizer)
                _tmp_css = _tmp_css.replace(RET_LINE_REG, "");
            this.css += _tmp_css;
        }

        //@TODO record
        var report = {};
        report[image_file.subpath] = unique(arr_selector.join(',').split(',')).length;
        fis.emitter.emit('csssprite:record', report);

    },
    z_pack: require('./pack.js'),
    fill: function (list, direct, spriteName) {
        if (!list || list.length == 0) {
            return;
        }
        var max = 0;
        var images = [];
        //宽度或者高的和
        var total = 0;
        var parsed = [];
        var i, k, len, count, op_max;

        for (i = 0, k = -1, len = list.length; i < len; i++) {
            if (parsed.indexOf(list[i].getImageUrl()) == -1) {
                parsed.push(list[i].getImageUrl());
                k++;
                var img = list[i].image_;
                var size = img.size();
                images[k] = {
                    url: list[i].getImageUrl(),
                    cls: [],
                    image: img,
                    width: size.width,
                    height: size.height
                };
                images[k].cls.push({
                    selector: list[i].getId(),
                    position: list[i].getPosition()
                });
                //如果是repeat-x的，记录最大宽度；如果是repeat-y的，记录最大高度
                op_max = (direct == 'x') ? size.width : size.height;
                if (op_max > max) {
                    max = op_max;
                }
                //如果是repeat-x的，计算高度和；如果是repeat-y的，计算宽度和
                total += (direct == 'x' ? size.height : size.width) + this.settings.margin;
            } else {
                var key = this._imageExist(images, list[i].getImageUrl());
                images[key].cls.push({
                    selector: list[i].getId(),
                    position: list[i].getPosition()
                });
            }
        }

        if (images.length == 0) {
            return;
        }

        //减掉多加的一次margin
        total -= this.settings.margin;
        var height = direct == 'x' ? total : max;
        var width = direct == 'x' ? max : total;
        var image = Image(width, height);

        var x = 0, y = 0, cls = [];
        for (i = 0, len = images.length; i < len; i++) {
            image.draw(images[i].image, x, y);

            if (direct == 'y' && images[i].height < max) {
                //如果高度小于最大高度，则在Y轴平铺当前图
                for (k = 0, count = max / images[i].height; k < count; k++) {
                    image.draw(images[i].image, x, images[i].height * (k + 1));
                }
            } else if (direct == 'x' && images[i].width < max) {
                //如果宽度小于最大宽度，则在X轴方向平铺当前图
                for (k = 0, count = max / images[i].width; k < count; k++) {
                    image.draw(images[i].image, images[i].width * (k + 1), y);
                }
            }
            for (k = 0, count = images[i].cls.length; k < count; k++) {
                this.css += images[i].cls[k].selector + '{background-position:'
                    + (images[i].cls[k].position[0] + -x) + 'px '
                    + (images[i].cls[k].position[1] + -y) + 'px}';
                cls.push(images[i].cls[k].selector);
            }
            if (direct == 'x') {
                y += images[i].height + this.settings.margin;
            } else {
                x += images[i].width + this.settings.margin;
            }
        }

        this.after(image, cls, direct, null, spriteName);
    },
    px2rem: function (_px) {
        var unit = this.settings.px2rem && !isNaN(parseInt(this.settings.px2rem)) && parseInt(this.settings.px2rem);
        if (!this.settings.useRempx) {
            return _px;
        }
        if(!unit){
            return _px;   
        }
        var px = parseInt(_px);
        return typeof _px === 'string' ? px / unit + 'rem ' : px / unit;
    },
    zFill: function (list, scale, spriteName) {
        if (!list || list.length == 0) {
            return;
        }
        var i, k, k0, length, images = [[], []], parsed = [[], []], max = [0, 0], total = [0, 0];
        var _images = [];
        for (i = 0, k = [-1, -1], length = list.length; i < length; i++) {
            var item = list[i];
            // 如果默认是linear，type全都设为left
            if (this.settings.layout == 'linear') {
                item.setType('left');
            }

            if (item.getType() == 'left') {
                k0 = 0;
            } else {
                k0 = 1;
            }
            if (parsed[k0].indexOf(item.getImageUrl()) == -1) {
                parsed[k0].push(item.getImageUrl());
                var img = item.image_;
                var size = img.size();
                if (item.getType() == 'left') {
                    //计算最大宽度
                    if (size.width > max[k0]) {
                        max[k0] = size.width;
                    }
                    total[k0] += size.height + this.settings.margin;
                }
                k[k0]++;
                images[k0][k[k0]] = {
                    url: item.getImageUrl(),
                    cls: [],
                    image: img,
                    w: size.width + this.settings.margin,
                    h: size.height + this.settings.margin
                };
                if (k0 == 0) {
                    //left合并为一竖行，不需要在宽度上加margin
                    images[k0][k[k0]].w -= this.settings.margin;
                }
                images[k0][k[k0]].cls.push({
                    selector: list[i].getId(),
                    position: list[i].getPosition()
                });
            } else {
                var key = this._imageExist(images[k0], item.getImageUrl());
                images[k0][key].cls.push({
                    selector: list[i].getId(),
                    position: list[i].getPosition()
                });
            }
        }

        var left = 0, zero = 1;
        if (images[zero].length == 0
            && images[left].length == 0) {
            return;
        }
        if (images[zero]) {
            var zero_root;
            _images = images[zero].concat([]);// 为了在后面保证css的顺序一致
            //高度从大到小排序
            images[zero].sort(function (a, b) {
                return -(a.h - b.h);
            });
            this.z_pack.fit(images[zero]);
            zero_root = this.z_pack.getRoot();
            max[zero] = zero_root.w;
            total[zero] = zero_root.h;
        }
        var height = 0;
        for (i = 0, length = total.length; i < length; i++) {
            if (total[i] > height) {
                height = total[i];
            }
        }

        //减掉多加了一次的margin
        height = height - this.settings.margin;
        //left, zero
        //zero | left
        var image = Image(max[left] + max[zero], height)
            , x = 0
            , y = 0
            , j = 0
            , cls = []
            , count = 0
            , current
            , _tmp_css;
        if (images[zero]) {
            for (i = 0, length = images[zero].length; i < length; i++) {
                current = images[zero][i];
                x = current.fit.x;
                y = current.fit.y;

                image.draw(Image(current.image), x, y);
                for (j = 0, count = current.cls.length; j < count; j++) {
                    var x_ = current.cls[j].position[0] + -x;
                    var y_ = current.cls[j].position[1] + -y;
                    if (scale) {
                        x_ = x_ * scale;
                        y_ = y_ * scale;
                    }
                    current.cls[j].x_ = x_;
                    current.cls[j].y_ = y_;
                    // NOTE: 为了保证css顺序而注释本行
                    //  cls.push(current.cls[j].selector);
                }
            }
            for (i = 0, length = _images.length; i < length; i++) {
                current = _images[i];
                for (j = 0, count = current.cls.length; j < count; j++) {
                    _tmp_css = "\r\n" + current.cls[j].selector + '{\r\n    background-position:'
                        + this.px2rem(current.cls[j].x_ + 'px ')
                        + this.px2rem(current.cls[j].y_ + 'px') + ';\r\n}';
                    if (this.file.optimizer)
                        _tmp_css = _tmp_css.replace(RET_LINE_REG, "");
                    this.css += _tmp_css;
                    cls.push(current.cls[j].selector);
                }
            }
        }

        if (images[left]) {
            y = 0;
            for (i = 0, length = images[left].length; i < length; i++) {
                current = images[left][i];
                x = max[zero] + max[left] - current.w;
                image.draw(Image(current.image), x, y);
                for (j = 0, count = current.cls.length; j < count; j++) {
                    var x_, y_ = (current.cls[j].position[1] + -y) + 'px';
                    if (scale) {
                        y_ = ((current.cls[j].position[1] + -y) * scale) + 'px'
                    }

                    if (current.cls[j].position[0] == 'right') {
                        x_ = 'right ';
                    } else {
                        x_ = -x + current.cls[j].position[0];
                        if (scale) {
                            x_ = x_ * scale;
                        }
                        x_ = this.px2rem(x_ + 'px ');
                    }

                    this.css += current.cls[j].selector + '{background-position:'
                        + x_
                        + y_ + '}';
                    cls.push(current.cls[j].selector);
                }
                y += current.h;
            }
        }
        this.after(image, cls, 'z', scale, spriteName);
    }
};
