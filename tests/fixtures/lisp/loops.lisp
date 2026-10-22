(defun squares (n)
  (loop for i from 1 to n sum (* i i)))

(defun evens (n)
  (loop for i below n count (evenp i)))

(defun biggest ()
  (let ((v (vector 3 9 2 7)))
    (loop for i below 4 maximize (aref v i))))

(defun first-big (n)
  (loop for i from 1 to n until (> (* i i) 20) sum i))

(format t "~d ~d ~d ~d~%" (squares 5) (evens 7) (biggest) (first-big 100))
(loop repeat 3 do (format t "x"))
(terpri)
(loop for i from 10 downto 1 by 3 do (format t "~d " i))
(terpri)
