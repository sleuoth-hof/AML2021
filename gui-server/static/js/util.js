export const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    //TODO: transform to real Base64
    reader.readAsDataURL(file);
    const dataUrl = reader.result;
    //const data = dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
    //console.log(typeof dataUrl);
    reader.onload = (e) => {
        resolve(e.target.result.replace(/^data:image\/(.+);base64,/, ""));
    };
    reader.onerror = error => reject(error);
});

export function setImageSrcBitmap(selector, base64) {
    if(typeof selector === "string" && typeof base64 === "string"){
        document.querySelector(selector).src = `data:image;base64,${base64}`;
    }
}